"""Process-wide PostHog client lifecycle for the FastAPI application."""

from posthog import Posthog

from app.core.config import settings

posthog_client: Posthog | None = None


def initialize_posthog() -> None:
    """Initialize the optional PostHog client once during application startup."""
    global posthog_client

    if posthog_client is not None:
        return
    # Analytics are optional: without a token the app runs exactly as before.
    if not settings.posthog_project_token or not settings.posthog_host:
        return

    posthog_client = Posthog(
        project_api_key=settings.posthog_project_token,
        host=settings.posthog_host,
        enable_exception_autocapture=True,
    )


def get_posthog_client() -> Posthog | None:
    """Return the singleton client after FastAPI lifespan startup."""
    return posthog_client


def shutdown_posthog() -> None:
    """Flush queued events during FastAPI lifespan shutdown."""
    if posthog_client is not None:
        posthog_client.shutdown()
