from typing import Optional, Any
from enum import Enum
from pydantic import BaseModel


class FormFieldTypeEnum(Enum):
    """Form field type enum"""

    short_answer = "short_answer"
    number = "number"
    paragraph = "paragraph"
    multiple_choice = "multiple_choice"
    checkboxes = "checkboxes"
    dropdown = "dropdown"
    date = "date"
    datetime = "datetime"
    time = "time"
    files = "files"


class FormFieldConfig(BaseModel):
    """Form field configuration schema for field_config JSON column"""

    # Field-specific options
    options: Optional[list[str]] = None  # For multiple_choice, checkboxes, dropdown
    min_value: Optional[int] = None  # For number fields
    max_value: Optional[int] = None  # For number fields
    min_length: Optional[int] = None  # For text fields
    max_length: Optional[int] = None  # For text fields
    max_files: Optional[int] = None  # For file upload fields
    allowed_file_types: Optional[list[str]] = None  # For file upload fields

    # Validation rules
    validation_pattern: Optional[str] = None  # Regex pattern for validation
    validation_message: Optional[str] = None  # Custom validation error message


class FormField(BaseModel):
    """Complete form field schema including database fields and config"""

    id: Optional[int] = None  # Database ID
    field_id: str  # Unique field identifier within the form
    field_type: str  # Field type from FormFieldTypeEnum
    label: str  # Field label displayed to users
    description: Optional[str] = None  # Optional field description/help text
    required: bool = False  # Whether field is required
    placeholder: Optional[str] = None  # Placeholder text for input fields
    sort_order: int = 0  # Order of fields in the form
    field_config: Optional[FormFieldConfig] = None  # Field-specific configuration


class FormSubmissionData(BaseModel):
    """Form submission data schema"""

    field_values: dict[str, Any]  # field_id -> submitted_value mapping
    submitter_info: Optional[dict] = None  # Optional submitter metadata
