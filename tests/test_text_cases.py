from deepsel.utils.text_cases import (
    pascal_to_snake,
    snake_to_camel,
    snake_to_capitalized,
    snake_to_pascal,
)


def test_pascal_to_snake_simple():
    assert pascal_to_snake("UserName") == "user_name"


def test_pascal_to_snake_single_word():
    assert pascal_to_snake("User") == "user"


def test_pascal_to_snake_multiple_capitals():
    assert pascal_to_snake("HTTPResponse") == "h_t_t_p_response"


def test_pascal_to_snake_already_lower():
    assert pascal_to_snake("already") == "already"


def test_pascal_to_snake_empty_string():
    assert pascal_to_snake("") == ""


def test_pascal_to_snake_three_words():
    assert pascal_to_snake("MyUserName") == "my_user_name"


def test_snake_to_camel_simple():
    assert snake_to_camel("user_name") == "userName"


def test_snake_to_camel_single_word():
    assert snake_to_camel("user") == "user"


def test_snake_to_camel_multiple_underscores():
    assert snake_to_camel("first_name_last") == "firstNameLast"


def test_snake_to_camel_empty_string():
    assert snake_to_camel("") == ""


def test_snake_to_capitalized_simple():
    assert snake_to_capitalized("user_name") == "User Name"


def test_snake_to_capitalized_single_word():
    assert snake_to_capitalized("user") == "User"


def test_snake_to_capitalized_multiple():
    assert snake_to_capitalized("first_name_last") == "First Name Last"


def test_snake_to_pascal_simple():
    assert snake_to_pascal("user_name") == "UserName"


def test_snake_to_pascal_single_word():
    assert snake_to_pascal("user") == "User"


def test_snake_to_pascal_multiple():
    assert snake_to_pascal("first_name_last") == "FirstNameLast"
