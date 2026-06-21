from __future__ import annotations

from typing import Literal

import unicodedata

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def validate_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value.strip())
    if normalized and len(normalized) > 120:
        raise ValueError("Session name must be 120 characters or fewer")
    return value


def validate_code(value: str) -> str:
    if len(value.encode("utf-8")) > 1_048_576:
        raise ValueError("Code must be 1 MiB or smaller when encoded as UTF-8")
    return value


def validate_mutation_id(value: str) -> str:
    if any(character.isspace() for character in value):
        raise ValueError("Mutation ID must not contain whitespace")
    if any(unicodedata.category(character).startswith("C") for character in value):
        raise ValueError("Mutation ID must not contain control characters")
    return value


def validate_tags(value: list[str]) -> list[str]:
    if len(value) > 10:
        raise ValueError("A session can have at most 10 tags")
    for tag in value:
        normalized = unicodedata.normalize("NFKC", tag.strip())
        if not normalized:
            raise ValueError("Tags must not be empty")
        if len(normalized) > 32:
            raise ValueError("Tags must be 32 characters or fewer")
    return value


class SessionResource(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code: str
    tags: list[str]
    revision: int
    created_at: str
    updated_at: str


class SessionSummary(BaseModel):
    id: str
    name: str
    code_preview: str
    tags: list[str]
    revision: int
    created_at: str
    updated_at: str


class SessionListResponse(BaseModel):
    items: list[SessionSummary]
    next_cursor: str | None = None


class AppSettingsResponse(BaseModel):
    data_path: str


class MutationMeta(BaseModel):
    mutation_id: str
    applied_revision: int
    duplicate: bool = False
    superseded: bool = False


class MutationResponse(BaseModel):
    session: SessionResource
    mutation: MutationMeta


class CreateSessionRequest(BaseModel):
    name: str = Field(default="Untitled Session", max_length=120)
    code: str = Field(default='print("Hello, world!")\n', max_length=1_048_576)
    tags: list[str] = Field(default_factory=list)
    mutation_id: str = Field(min_length=1, max_length=128)

    _validate_name = field_validator("name")(validate_name)
    _validate_code = field_validator("code")(validate_code)
    _validate_tags = field_validator("tags")(validate_tags)
    _validate_mutation_id = field_validator("mutation_id")(validate_mutation_id)


class PatchSessionRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    code: str | None = Field(default=None, max_length=1_048_576)
    tags: list[str] | None = None
    expected_revision: int = Field(ge=1)
    mutation_id: str = Field(min_length=1, max_length=128)

    _validate_name = field_validator("name")(validate_name)
    _validate_code = field_validator("code")(validate_code)
    _validate_tags = field_validator("tags")(validate_tags)
    _validate_mutation_id = field_validator("mutation_id")(validate_mutation_id)

    @model_validator(mode="after")
    def require_a_change(self) -> "PatchSessionRequest":
        if self.name is None and self.code is None and self.tags is None:
            raise ValueError("At least one of name, code, or tags is required")
        return self


class DeleteSessionRequest(BaseModel):
    expected_revision: int = Field(ge=1)
    mutation_id: str = Field(min_length=1, max_length=128)

    _validate_mutation_id = field_validator("mutation_id")(validate_mutation_id)


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: ErrorDetail


Operation = Literal["create", "patch", "delete"]
