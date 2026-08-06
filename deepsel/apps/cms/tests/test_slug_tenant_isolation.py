from sqlalchemy.orm import Session

from deepsel.utils.models_pool import models_pool

OrganizationModel = models_pool["organization"]
UserModel = models_pool["user"]
BlogPostModel = models_pool["blog_post"]
LocaleModel = models_pool["locale"]
PageModel = models_pool["page"]
PageContentModel = models_pool["page_content"]


def _make_attacker(db: Session, current_organization_id: int):
    """A real user row (owner_id FKs to it) with current_organization_id
    attached the same way get_current_user does at runtime — it's not a DB
    column, just an attribute the auth dependency sets after load."""
    user = UserModel(username="attacker", email="attacker@test.com")
    db.add(user)
    db.commit()
    user.current_organization_id = current_organization_id
    return user


def test_blog_post_create_ignores_client_supplied_organization_id(db: Session):
    """Regression test: a client-supplied organization_id in the create()
    payload must not be used for the slug conflict pre-check — only the
    authenticated user's own tenant. Otherwise a user in org A can send
    organization_id=<org B> and learn (via the 400 detail, which includes
    the conflicting post's id) that org B already has a post at that slug,
    before any permission/membership check ever runs.
    """
    org_a = OrganizationModel(name="Org A")
    org_b = OrganizationModel(name="Org B")
    db.add_all([org_a, org_b])
    db.commit()

    # Seed a real post in org B directly (bypassing create(), which is what
    # we're testing) so org B has something to probe for.
    victim_post = BlogPostModel(slug="/secret-launch", organization_id=org_b.id)
    db.add(victim_post)
    db.commit()

    attacker = _make_attacker(db, current_organization_id=org_a.id)

    # Attacker (authenticated into org A) tries to create a post while
    # claiming organization_id=org_b.id and the exact slug the victim post
    # in org B already has.
    created = BlogPostModel.create(
        db,
        attacker,
        {"slug": "/secret-launch", "organization_id": org_b.id},
        bypass_permission=True,
    )

    # The pre-check must have validated against org A (empty), not org B
    # (where the conflict lives) — so creation succeeds instead of raising
    # the 400 whose detail message would have confirmed org B's post exists
    # (id + slug). Whether the row's own final organization_id should be
    # allowed to be attacker-supplied at all is a separate, broader
    # tenant-write concern this fix does not attempt to close.
    assert created.slug == "/secret-launch"  # nosec B101


def test_page_content_create_ignores_client_supplied_organization_id(db: Session):
    """Same cross-tenant probe protection as above, for page_content."""
    org_a = OrganizationModel(name="Org A")
    org_b = OrganizationModel(name="Org B")
    locale = LocaleModel(name="English", iso_code="en")
    db.add_all([org_a, org_b, locale])
    db.commit()

    page_b = PageModel(organization_id=org_b.id)
    db.add(page_b)
    db.commit()

    victim_content = PageContentModel(
        title="Secret",
        slug="/secret-launch",
        locale_id=locale.id,
        page_id=page_b.id,
        organization_id=org_b.id,
    )
    db.add(victim_content)
    db.commit()

    page_a = PageModel(organization_id=org_a.id)
    db.add(page_a)
    db.commit()

    attacker = _make_attacker(db, current_organization_id=org_a.id)

    created = PageContentModel.create(
        db,
        attacker,
        {
            "title": "Attacker content",
            "slug": "/secret-launch",
            "locale_id": locale.id,
            "page_id": page_a.id,
            "organization_id": org_b.id,
        },
        bypass_permission=True,
    )

    # See test_blog_post_create_ignores_client_supplied_organization_id for
    # what this does and doesn't claim.
    assert created.slug == "/secret-launch"  # nosec B101
