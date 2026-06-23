"""Minimal built-in app for verifying the package-app seam."""

from deepsel.apps.example.models.example_item import create_example_item_model


def register_models(base):
    ExampleItem = create_example_item_model(base)
    return {ExampleItem.__tablename__: ExampleItem}
