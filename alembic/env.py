from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

# Load .env first so DATABASE_URL etc. are visible to api.config.
# main.py does this for uvicorn; alembic doesn't go through main.py.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from alembic import context

# Import our database configuration and models
from api.config import DATABASE_URL
from api.database import Base
# Import all models to ensure they are registered with Base.metadata
from api.models.db import (  # noqa: F401
    User, Session,
    AccessLevel, TestCollection, TestShare,
    ChangeRequest, ChangeRequestType, ChangeRequestStatus,
    Attempt, AttemptAnswer, AttemptStatus,
    QuestionPerformance,
    Notification,
    Question,
    ImportJob, ImportJobStatus,
    OutgoingEmail, OutgoingEmailStatus,
)
# Side-effect imports — register models that aren't re-exported but still
# need to live in Base.metadata for `create_all`/autogenerate.
from api.models.db.password_reset import PasswordResetToken  # noqa: F401
from api.models.db.flagged_question import FlaggedQuestion  # noqa: F401
from api.models.db.access_request import AccessRequest  # noqa: F401
from api.models.db.activity_event import ActivityEvent  # noqa: F401

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Override sqlalchemy.url from our config
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
