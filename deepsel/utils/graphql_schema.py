import logging
import strawberry
import enum
from typing import Optional, List, Dict, Type, Any
from sqlalchemy import inspect
from sqlalchemy.orm import Session
from strawberry.scalars import JSON
from strawberry.types import Info
from strawberry import asdict
from strawberry.schema.config import StrawberryConfig
from deepsel.utils.models_pool import models_pool
from deepsel.utils.technical_fields import technical_fields as TECHNICAL_FIELDS
from deepsel.orm import (
    SearchQuery,
    SearchCriteria,
    OrderByCriteria,
    Operator,
    OrderDirection,
)

logger = logging.getLogger(__name__)


# GraphQL Enums and Input Types for Search/Filter
@strawberry.enum
class OperatorEnum(enum.Enum):
    EQ = "="
    NE = "!="
    IN = "in"
    NOT_IN = "not_in"
    BETWEEN = "between"
    CONTAINS = "contains"
    GT = ">"
    GTE = ">="
    LT = "<"
    LTE = "<="
    LIKE = "like"
    ILIKE = "ilike"


@strawberry.input
class SearchCriteriaInput:
    field: str
    operator: OperatorEnum
    value: Optional[JSON] = (
        None  # Use JSON scalar to accept any value type, including null
    )


@strawberry.input
class SearchQueryInput:
    AND: Optional[List[SearchCriteriaInput]] = None
    OR: Optional[List[SearchCriteriaInput]] = None


@strawberry.enum
class OrderDirectionEnum(enum.Enum):
    ASC = "asc"
    DESC = "desc"


@strawberry.input
class OrderByCriteriaInput:
    field: str
    direction: OrderDirectionEnum = OrderDirectionEnum.ASC


@strawberry.type
class BulkDeleteResponse:
    success: bool
    deleted_count: int


def get_graphql_type_from_sqlalchemy_type(sqlalchemy_type) -> tuple:
    """Map SQLAlchemy types to GraphQL types (type, is_optional)"""
    type_string = str(sqlalchemy_type).upper()

    # Basic type mapping
    if (
        "STRING" in type_string
        or "TEXT" in type_string
        or "UUID" in type_string
        or "LARGEBINARY" in type_string
        or "VARCHAR" in type_string
    ):
        return (str, True)  # All strings are optional for input types
    elif (
        "INTEGER" in type_string
        or "BIGINTEGER" in type_string
        or "SMALLINTEGER" in type_string
    ):
        return (int, True)
    elif "FLOAT" in type_string or "NUMERIC" in type_string:
        return (float, True)
    elif "BOOLEAN" in type_string:
        return (bool, True)
    elif "DATETIME" in type_string or "DATE" in type_string or "TIME" in type_string:
        return (str, True)  # Dates as strings
    elif "JSON" in type_string:
        return (JSON, True)
    else:
        return (str, True)


class AutoGraphQLFactory:
    """Auto-generate GraphQL schema from SQLAlchemy models"""

    def __init__(self):
        self.generated_types = {}
        self.generated_input_types = {}
        self.generated_resolvers = {}
        self.processing_input_types = set()

    def generate_type_for_model(self, model_class: Type, table_name: str) -> Type:
        """Generate Strawberry type from SQLAlchemy model"""
        if table_name in self.generated_types:
            return self.generated_types[table_name]

        # Get all column information
        mapper = inspect(model_class)
        columns = mapper.columns

        # Create type annotations dictionary
        annotations = {}

        for column in columns:
            field_name = column.name
            # Include ALL fields in GraphQL - no filtering

            # Determine GraphQL type
            graphql_type, _ = get_graphql_type_from_sqlalchemy_type(column.type)

            # Handle nullable fields for output types
            if column.nullable:
                if graphql_type == JSON:
                    annotations[field_name] = Optional[JSON]
                else:
                    annotations[field_name] = Optional[graphql_type]
            else:
                if graphql_type == JSON:
                    annotations[field_name] = JSON
                else:
                    annotations[field_name] = graphql_type

        # Add relationship fields
        mapper = inspect(model_class)
        relationships = getattr(mapper, "relationships", {})

        for rel in relationships:
            field_name = rel.key
            # Get the related model name from the relationship
            related_model = rel.entity.mapper.class_
            related_table_name = (
                related_model.__tablename__
                if hasattr(related_model, "__tablename__")
                else field_name
            )

            # Skip self-referencing relationships to avoid recursion
            if related_model == model_class:
                continue

            # Add relationship as string to be resolved later
            if rel.uselist:
                # One-to-many or many-to-many relationship (always returns a list, even if empty)
                annotations[field_name] = f"List[{related_table_name.capitalize()}]"
            else:
                # Many-to-one or one-to-one relationship (can be null)
                annotations[field_name] = f"Optional[{related_table_name.capitalize()}]"

        # Create class with annotations
        class_name = table_name.capitalize()
        class_namespace = {"__annotations__": annotations}
        GeneratedType = type(class_name, (), class_namespace)

        # Apply Strawberry decorator
        GeneratedType = strawberry.type(GeneratedType)

        self.generated_types[table_name] = GeneratedType

        # Add to globals so Strawberry can resolve string references
        globals()[class_name] = GeneratedType

        logger.debug(f"Generated GraphQL type: {class_name}")
        return GeneratedType

    def generate_input_types_for_model(
        self, model_class: Type, table_name: str
    ) -> tuple:
        """Generate create and update input types"""
        create_key = f"{table_name}_create"
        update_key = f"{table_name}_update"

        # Generate create input type
        if create_key not in self.generated_input_types:
            mapper = inspect(model_class)
            columns = mapper.columns

            annotations = {}
            for column in columns:
                field_name = column.name
                if field_name in TECHNICAL_FIELDS:
                    continue

                # Skip auto-incrementing primary key for create
                if column.primary_key and column.autoincrement:
                    continue

                # All input fields should be optional for flexibility
                graphql_type, _ = get_graphql_type_from_sqlalchemy_type(column.type)
                annotations[field_name] = Optional[graphql_type]

            # Skip input type generation if no usable fields (likely association table)
            if not annotations:
                logger.debug(
                    f"Skipping create input type for {table_name} - no usable fields"
                )
                return None, None

            # Add relationship fields for nested creation
            if table_name not in self.processing_input_types:
                self.processing_input_types.add(table_name)
                try:
                    mapper = inspect(model_class)
                    relationships = getattr(mapper, "relationships", {})

                    for rel in relationships:
                        # Only support One-to-Many for nested creation to avoid complexity/cycles
                        if rel.direction.name == "ONETOMANY":
                            field_name = rel.key
                            related_model = rel.entity.mapper.class_
                            related_table_name = related_model.__tablename__

                            # Avoid recursion
                            if related_table_name in self.processing_input_types:
                                continue

                            # Generate input type for related model
                            related_create_input, _ = (
                                self.generate_input_types_for_model(
                                    related_model, related_table_name
                                )
                            )

                            if related_create_input:
                                annotations[field_name] = Optional[
                                    List[related_create_input]
                                ]
                finally:
                    self.processing_input_types.remove(table_name)

            class_name = f"{table_name.capitalize()}CreateInput"
            # Create class with default None values for all fields to make them optional
            class_namespace = {
                "__annotations__": annotations,
                **{field_name: None for field_name in annotations.keys()},
            }
            CreateInputType = type(class_name, (), class_namespace)
            CreateInputType = strawberry.input(CreateInputType)

            self.generated_input_types[create_key] = CreateInputType

        # Generate update input type (all fields optional)
        if update_key not in self.generated_input_types:
            mapper = inspect(model_class)
            columns = mapper.columns

            annotations = {}
            for column in columns:
                field_name = column.name
                if field_name in TECHNICAL_FIELDS:
                    continue
                if field_name == "id":  # Don't allow updating ID
                    continue

                graphql_type, _ = get_graphql_type_from_sqlalchemy_type(column.type)
                annotations[field_name] = Optional[graphql_type]

            # Skip input type generation if no usable fields (likely association table)
            if not annotations:
                logger.warning(
                    f"Skipping update input type for {table_name} - no usable fields"
                )
                return None, None

            class_name = f"{table_name.capitalize()}UpdateInput"
            # Create class with default None values for all fields to make them truly optional
            class_namespace = {
                "__annotations__": annotations,
                **{field_name: None for field_name in annotations.keys()},
            }
            UpdateInputType = type(class_name, (), class_namespace)
            UpdateInputType = strawberry.input(UpdateInputType)

            self.generated_input_types[update_key] = UpdateInputType

        create_input = self.generated_input_types.get(create_key)
        update_input = self.generated_input_types.get(update_key)

        # Return None if either input type doesn't exist (association table)
        if not create_input or not update_input:
            return None, None

        return create_input, update_input

    def generate_resolvers_for_model(self, model_class: Type, table_name: str) -> Dict:
        """Generate CRUD resolvers for a model"""
        if table_name in self.generated_resolvers:
            return self.generated_resolvers[table_name]

        model_type = self.generate_type_for_model(model_class, table_name)
        create_input_type, update_input_type = self.generate_input_types_for_model(
            model_class, table_name
        )

        # Skip resolvers if input types couldn't be generated (association table)
        if not create_input_type or not update_input_type:
            logger.debug(
                f"Skipping resolvers for {table_name} - no input types available"
            )
            return None

        # Query resolvers
        def get_one(info: Info, id: int) -> Optional[model_type]:
            """Get single record by ID"""
            db: Session = info.context["db"]
            user = info.context["user"]

            try:
                return model_class.get_one(db, user, id)
            except Exception as e:
                logger.error(f"Error getting {table_name} {id}: {e}")
                return None

        def search(
            info: Info,
            skip: int = 0,
            limit: int = 20,
            search: Optional[SearchQueryInput] = None,
            order_by: Optional[OrderByCriteriaInput] = None,
        ) -> List[model_type]:
            """Search records with pagination, filtering, and sorting"""
            db: Session = info.context["db"]
            user = info.context["user"]

            try:
                # Convert Strawberry inputs to ORM types
                search_query = None
                if search:
                    # Build search criteria lists
                    and_criteria = []
                    or_criteria = []

                    if search.AND is not None:
                        and_criteria = [
                            SearchCriteria(**asdict(criteria))
                            for criteria in search.AND
                        ]

                    if search.OR is not None:
                        or_criteria = [
                            SearchCriteria(**asdict(criteria)) for criteria in search.OR
                        ]

                    search_query = SearchQuery(AND=and_criteria, OR=or_criteria)

                order_criteria = None
                if order_by:
                    order_dict = asdict(order_by)
                    order_criteria = OrderByCriteria(**order_dict)

                result = model_class.search(
                    db,
                    user,
                    pagination={"skip": skip, "limit": limit},
                    search=search_query,
                    order_by=order_criteria,
                )
                return result.get("data", [])
            except Exception as e:
                import traceback

                logger.error(f"Error searching {table_name}: {e}")
                logger.error(f"Traceback: {traceback.format_exc()}")
                return []

        # Mutation resolvers
        def create(info: Info, input: create_input_type) -> Optional[model_type]:
            """Create new record"""
            db: Session = info.context["db"]
            user = info.context["user"]

            try:
                # Handle password hashing for user model
                user_data = asdict(input)
                # Filter out None values to allow defaults to work
                user_data = {k: v for k, v in user_data.items() if v is not None}

                return model_class.create(db, user, user_data)
            except Exception as e:
                logger.error(f"Error creating {table_name}: {e}")
                db.rollback()
                return None

        def update(
            info: Info, id: int, input: update_input_type
        ) -> Optional[model_type]:
            """Update existing record"""
            db: Session = info.context["db"]
            user = info.context["user"]

            try:
                # Get the record first
                record = model_class.get_one(db, user, id)
                if not record:
                    return None

                # Filter out None values
                update_data = {k: v for k, v in input.__dict__.items() if v is not None}

                # Call update on the instance, not the class
                return record.update(db, user, update_data)
            except Exception as e:
                logger.error(f"Error updating {table_name} {id}: {e}")
                db.rollback()
                return None

        def delete(info: Info, id: int) -> bool:
            """Delete record"""
            db: Session = info.context["db"]
            user = info.context["user"]

            try:
                record = model_class.get_one(db, user, id)
                if record:
                    result = record.delete(db, user)
                    # delete() returns {'success': True/False}, extract the boolean
                    return (
                        result.get("success", False)
                        if isinstance(result, dict)
                        else bool(result)
                    )
                return False
            except Exception as e:
                logger.error(f"Error deleting {table_name} {id}: {e}")
                db.rollback()
                return False

        def bulk_delete(
            info: Info,
            search: SearchQueryInput,
            force: bool = False,
            bypass_permission: bool = False,
        ) -> BulkDeleteResponse:
            """Bulk delete records matching search criteria"""
            db: Session = info.context["db"]
            user = info.context["user"]

            try:
                # Convert Strawberry input to ORM type
                and_criteria = []
                or_criteria = []

                if search.AND is not None:
                    and_criteria = [
                        SearchCriteria(**asdict(criteria)) for criteria in search.AND
                    ]

                if search.OR is not None:
                    or_criteria = [
                        SearchCriteria(**asdict(criteria)) for criteria in search.OR
                    ]

                search_query = SearchQuery(AND=and_criteria, OR=or_criteria)

                result = model_class.bulk_delete(
                    db,
                    user,
                    search=search_query,
                    force=force,
                    bypass_permission=bypass_permission,
                )
                return BulkDeleteResponse(
                    success=result.success,
                    deleted_count=result.deleted_count,
                )
            except Exception as e:
                import traceback

                logger.error(f"Error bulk deleting {table_name}: {e}")
                logger.error(f"Traceback: {traceback.format_exc()}")
                db.rollback()
                return BulkDeleteResponse(success=False, deleted_count=0)

        resolvers = {
            "get_one": get_one,
            "search": search,
            "create": create,
            "update": update,
            "delete": delete,
            "bulk_delete": bulk_delete,
        }

        self.generated_resolvers[table_name] = resolvers
        logger.debug(f"Generated resolvers for {table_name}")
        return resolvers

    def generate_schema(self, model_names: List[str]) -> strawberry.Schema:
        """Generate complete GraphQL schema for specified models"""
        mutation_fields = {}

        for model_name in model_names:
            if model_name in models_pool:
                model_class = models_pool[model_name]

                try:
                    # Generate types and resolvers
                    self.generate_type_for_model(model_class, model_name)
                    self.generate_input_types_for_model(model_class, model_name)

                    resolvers = self.generate_resolvers_for_model(
                        model_class, model_name
                    )

                    logger.debug(f"Added {model_name} to GraphQL schema")

                except Exception as e:
                    logger.error(f"Error adding {model_name} to schema: {e}")
                    continue
            else:
                logger.warning(f"Model {model_name} not found in models_pool")

        # Create hello resolver function first
        def hello_resolver() -> str:
            return "Hello from Auto-Generated GraphQL!"

        # Create Query class with hello and model fields
        class Query:
            hello: str = strawberry.field(hello_resolver)

        # Create Mutation class
        class Mutation:
            pass

        # Add model fields to Query and Mutation
        for model_name in model_names:
            if model_name in models_pool:
                resolvers = self.generated_resolvers.get(model_name)
                if resolvers:
                    # Add query and mutation fields
                    setattr(
                        Query,
                        f"get_{model_name}",
                        strawberry.field(resolvers["get_one"]),
                    )
                    setattr(
                        Query,
                        f"search_{model_name}",
                        strawberry.field(resolvers["search"]),
                    )

                    # Add mutation fields (with error handling)
                    try:
                        setattr(
                            Mutation,
                            f"create_{model_name}",
                            strawberry.mutation(resolvers["create"]),
                        )
                        setattr(
                            Mutation,
                            f"update_{model_name}",
                            strawberry.mutation(resolvers["update"]),
                        )
                        setattr(
                            Mutation,
                            f"delete_{model_name}",
                            strawberry.mutation(resolvers["delete"]),
                        )
                        setattr(
                            Mutation,
                            f"bulk_delete_{model_name}",
                            strawberry.mutation(resolvers["bulk_delete"]),
                        )
                    except Exception as field_error:
                        logger.error(
                            f"Error adding mutation fields for {model_name}: {field_error}"
                        )

                    logger.debug(f"Added {model_name} to GraphQL schema")
                else:
                    logger.debug(
                        f"Skipping GraphQL operations for {model_name} - no resolvers generated"
                    )

        # Apply Strawberry decorators
        Query = strawberry.type(Query)

        # Only create Mutation type if there are fields
        if hasattr(Mutation, "__annotations__") and Mutation.__annotations__:
            Mutation = strawberry.type(Mutation)
        else:
            # Check if there are any attributes that are not special methods
            mutation_fields = [d for d in dir(Mutation) if not d.startswith("_")]
            if mutation_fields:
                Mutation = strawberry.type(Mutation)
            else:
                Mutation = None

        schema = strawberry.Schema(
            query=Query,
            mutation=Mutation,
            config=StrawberryConfig(auto_camel_case=False),
        )
        logger.debug(f"Generated GraphQL schema for {len(self.generated_types)} models")
        return schema


# Factory instance for GraphQL schema generation
_graphql_factory = AutoGraphQLFactory()


def create_auto_schema() -> strawberry.Schema:
    """Create GraphQL schema using factory pattern"""
    model_names = list(models_pool.keys())
    logger.debug(f"Creating GraphQL schema for models: {model_names}")
    return _graphql_factory.generate_schema(model_names)


def get_graphql_factory() -> AutoGraphQLFactory:
    """Get the GraphQL factory instance"""
    return _graphql_factory
