from fastapi import Request
from fastapi.responses import JSONResponse


class Problem(Exception):
    def __init__(self, status: int, title: str, detail: str, type_: str = "about:blank"):
        self.status = status
        self.title = title
        self.detail = detail
        self.type = type_


async def problem_handler(request: Request, exc: Problem) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        media_type="application/problem+json",
        content={
            "type": exc.type,
            "title": exc.title,
            "status": exc.status,
            "detail": exc.detail,
            "instance": str(request.url.path),
        },
    )
