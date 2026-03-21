from sqlalchemy import Enum
from deepsel.utils.text_cases import snake_to_camel, snake_to_capitalized
from sqlalchemy import Column
from pydantic import BaseModel as PydanticModel
from typing import Any, Optional


class FieldInfo(PydanticModel):
    name: str
    camel_name: str
    pascal_name: str
    human_name: str
    type: str
    is_foreign_key: bool
    required: bool
    default: Optional[Any] = None
    enum_values: Optional[list] = None
    related_table: Optional[str] = None
    related_human_name: Optional[str] = None


def get_field_info(field: [Column]) -> FieldInfo:
    res = {
        "name": field.key,
        "camel_name": snake_to_camel(field.key),
        "pascal_name": field.key.replace("_", " ").title().replace(" ", ""),
        "human_name": snake_to_capitalized(field.key),
        "type": str(field.type),
        "is_foreign_key": field.foreign_keys != set(),
        "required": not field.nullable,
    }

    # check if enum type
    if field.type.Comparator == Enum.Comparator:
        res["type"] = "ENUM"
        res["enum_values"] = [option.value for option in field.type.enum_class]

    # default value
    if field.default:
        if res["type"] == "BOOLEAN":
            res["default"] = str(field.default.arg).lower()
        elif res["type"] == "ENUM":
            res["default"] = field.default.arg.value or res["enum_values"][0]
        else:
            res["default"] = field.default.arg

    if res["is_foreign_key"]:
        related_table = list(field.foreign_keys)[0].target_fullname.split(".")[0]
        res["related_table"] = related_table
        res["related_human_name"] = snake_to_capitalized(related_table)

    return FieldInfo(**res)
