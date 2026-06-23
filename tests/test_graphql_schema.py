import pytest

# import deepsel.utils first to avoid circular-import quirk during collection
from deepsel.utils.models_pool import models_pool  # noqa: F401

from strawberry.scalars import JSON

from deepsel.utils.graphql_schema import (
    AutoGraphQLFactory,
    OperatorEnum,
    OrderDirectionEnum,
    get_graphql_type_from_sqlalchemy_type,
)


class TestTypeMapping:
    @pytest.mark.parametrize(
        "sa_type,expected",
        [
            ("VARCHAR(255)", str),
            ("TEXT", str),
            ("UUID", str),
            ("INTEGER", int),
            ("BIGINTEGER", int),
            ("SMALLINTEGER", int),
            ("FLOAT", float),
            ("NUMERIC(10, 2)", float),
            ("BOOLEAN", bool),
            ("DATETIME", str),
            ("DATE", str),
            ("TIME", str),
            ("JSON", JSON),
        ],
    )
    def test_known_types(self, sa_type, expected):
        gql_type, is_optional = get_graphql_type_from_sqlalchemy_type(sa_type)
        assert gql_type is expected
        assert is_optional is True

    def test_unknown_type_falls_back_to_str(self):
        gql_type, is_optional = get_graphql_type_from_sqlalchemy_type("CUSTOMTYPE")
        assert gql_type is str
        assert is_optional is True

    def test_case_insensitive(self):
        assert get_graphql_type_from_sqlalchemy_type("integer")[0] is int


class TestEnums:
    def test_operator_enum_values(self):
        assert OperatorEnum.EQ.value == "="
        assert OperatorEnum.ILIKE.value == "ilike"
        assert OperatorEnum.BETWEEN.value == "between"

    def test_order_direction_values(self):
        assert OrderDirectionEnum.ASC.value == "asc"
        assert OrderDirectionEnum.DESC.value == "desc"


class TestFactoryInit:
    def test_starts_with_empty_caches(self):
        factory = AutoGraphQLFactory()
        assert factory.generated_types == {}
        assert factory.generated_input_types == {}
        assert factory.generated_resolvers == {}
        assert factory.processing_input_types == set()
