import re


def pascal_to_snake(pascal_str):
    return re.sub(r"(?<!^)(?=[A-Z])", "_", pascal_str).lower()


def snake_to_camel(snake_str):
    return re.sub(r"_([a-z])", lambda x: x.group(1).upper(), snake_str)


def snake_to_capitalized(snake_str):
    return snake_str.replace("_", " ").title()


def snake_to_pascal(snake_str):
    return snake_str.replace("_", " ").title().replace(" ", "")
