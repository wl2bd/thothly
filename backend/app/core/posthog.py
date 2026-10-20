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


def capture(event: str, properties: dict, job_id: str | None = None) -> None:
    """Send one event when analytics are on. Numbers, types and costs only: never
    a query, URL or title. A job's events share its id so a funnel can follow it."""
    if posthog_client is None:
        return
    # Personless: there are no accounts, so a job id or a random id stands in.
    posthog_client.capture(
        event,
        distinct_id=job_id,
        properties={**properties, "$process_person_profile": False},
    )


def capture_paid_call(provider: str, endpoint: str, cost_usd: float) -> None:
    """One metered call to a provider. The cost is an estimate from config; the
    invoice stays with the provider."""
    capture("paid_call", {"provider": provider, "endpoint": endpoint, "cost_usd": cost_usd})


def shutdown_posthog() -> None:
    """Flush queued events during FastAPI lifespan shutdown."""
    if posthog_client is not None:
        posthog_client.shutdown()
