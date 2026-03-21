"""Initialize GraphQL schema from all models and mount at /graphql."""

import logging
from typing import Callable

from fastapi import FastAPI

logger = logging.getLogger(__name__)


def init_graphql(application: FastAPI, context_getter: Callable):
    logger.info("Initializing GraphQL schema")

    try:
        from deepsel.utils.graphql_schema import create_auto_schema

        graphql_schema = create_auto_schema()
        logger.info("GraphQL schema generated successfully")
    except Exception as e:
        logger.error(f"Failed to generate GraphQL schema: {e}", exc_info=True)

        import strawberry

        @strawberry.type
        class Query:
            hello: str = strawberry.field(resolver=lambda: "Hello from GraphQL!")

        graphql_schema = strawberry.Schema(query=Query)
        logger.info("Using minimal fallback GraphQL schema")

    from strawberry.fastapi import GraphQLRouter

    graphql_router = GraphQLRouter(schema=graphql_schema, context_getter=context_getter)
    application.include_router(graphql_router, prefix="/graphql", tags=["GraphQL"])
    logger.info("GraphQL endpoint initialized at /graphql")
