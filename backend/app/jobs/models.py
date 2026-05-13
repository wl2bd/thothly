from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, HttpUrl

SourceType = Literal["youtube_channel", "youtube_playlist", "blog_rss", "blog_url"]


class Source(BaseModel):
    type: SourceType
    url: HttpUrl


class JobCreate(BaseModel):
    sources: Annotated[list[Source], Field(min_length=1)]


class JobResponse(BaseModel):
    id: str
    status: str
    sources: list[Source]
    created_at: datetime
    updated_at: datetime
