from pydantic import BaseModel, Field
from typing import Literal


class Login(BaseModel):
    username: str = Field(min_length=1,max_length=80)
    password: str = Field(min_length=1,max_length=200)


class UploadInit(BaseModel):
    filename: str = Field(min_length=1,max_length=240)
    size: int = Field(gt=0,le=8*1024*1024*1024)
    sha256: str = Field(pattern=r'^[0-9a-f]{64}$')
    album_id: str | None = None
    relative_path: str = Field(default='',max_length=1024)
    master_photo_id: str | None = Field(default=None,max_length=80)


class AlbumInput(BaseModel):
    kind: Literal['travel','project','series'] = 'series'
    title: str = Field(min_length=1,max_length=120)
    description: str = Field(default='',max_length=3000)
    published: bool = False
    position: int = Field(default=0,ge=-100000,le=100000)
    cover_id: str | None = None


class PhotoInput(BaseModel):
    category: Literal['','人像','自然','城市','星空'] | None = None
    title: str = Field(min_length=1,max_length=240)
    caption: str = Field(default='',max_length=5000)
    alt: str = Field(default='',max_length=300)
    tags: list[str] = Field(default_factory=list,max_length=20)
    published: bool = False
    featured: bool = False
    position: int = Field(default=0,ge=-100000,le=100000)
    album_ids: list[str] = Field(default_factory=list,max_length=30)


class PhotoBatchInput(BaseModel):
    ids: list[str] = Field(min_length=1,max_length=500)
    published: bool


class PostInput(BaseModel):
    title: str = Field(min_length=1,max_length=240)
    excerpt: str = Field(default='',max_length=600)
    body: str = Field(default='',max_length=60000)
    published: bool = False


class SettingInput(BaseModel):
    site_name: str = Field(min_length=1,max_length=80)
    subtitle: str = Field(max_length=200)
    description: str = Field(max_length=600)
    about: str = Field(max_length=10000)
    contact: str = Field(default='',max_length=300)
    copyright: str = Field(default='',max_length=200)

class PhotoIdsInput(BaseModel):
    ids: list[str] = Field(min_length=1,max_length=500)


class MetadataBatchInput(BaseModel):
    expected: dict[str,float] | None = Field(default=None,max_length=500)
    overwrite_place: bool = False
    ids: list[str] = Field(min_length=1,max_length=500)
    place: str | None = Field(default=None,max_length=120)
    date: str | None = Field(default=None,max_length=32)
    latitude: float | None = Field(default=None,ge=-90,le=90)
    longitude: float | None = Field(default=None,ge=-180,le=180)
    reset: bool = False

class DuplicateReviewInput(BaseModel):
    ids: list[str] = Field(min_length=2,max_length=2)
    keep: str | None = None


class AlbumMergeInput(BaseModel):
    target_id: str
