from __future__ import annotations

from functools import lru_cache
from typing import Any

import jwt
from fastapi import HTTPException, Request, status
from jwt import PyJWKClient

from aifactory_rag.config import RagAuthConfig


def user_from_claims(claims: dict[str, Any]) -> str | None:
    return claims.get("oid") or claims.get("sub") or claims.get("preferred_username") or claims.get("upn")


def validate_request(request: Request, auth: RagAuthConfig) -> dict[str, Any]:
    if not auth.enabled or auth.provider == "none":
        return {}

    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = header[7:].strip()
    try:
        if not auth.tenant_id:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="auth.tenantId is required")
        jwks_client = _jwks_client(auth.tenant_id)
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=auth.audience,
            issuer=_issuer(auth),
            options={"verify_aud": bool(auth.audience)},
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {exc}") from exc


@lru_cache(maxsize=16)
def _jwks_client(tenant_id: str) -> PyJWKClient:
    return PyJWKClient(f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys")


def _issuer(auth: RagAuthConfig) -> str | None:
    if auth.issuer:
        return auth.issuer
    if auth.tenant_id:
        return f"https://login.microsoftonline.com/{auth.tenant_id}/v2.0"
    return None
