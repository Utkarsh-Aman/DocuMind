"""Add chats and messages tables for V2.20 chat history

Revision ID: a1b2c3d4e5f6
Revises: 26f3eaae4e9c
Create Date: 2026-06-17 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# Revision identifiers used by Alembic
revision: str         = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '26f3eaae4e9c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None]    = None


def upgrade() -> None:
    """
    Create the chats and messages tables.

    chats   — one per conversation session, linked to a user
    messages — individual turns (user question + assistant answer) inside a chat
               Sources (citations) are stored as JSON alongside the assistant message.
    """

    # ------------------------------------------------------------------
    # Create chats table
    # ------------------------------------------------------------------
    op.create_table(
        'chats',
        sa.Column('id',         sa.Integer(),                  nullable=False),
        sa.Column('user_id',    sa.Integer(),                  nullable=False),
        sa.Column('title',      sa.String(),                   nullable=False, server_default='New Chat'),
        sa.Column('created_at', sa.DateTime(timezone=True),   nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_chats_id'),      'chats', ['id'],      unique=False)
    op.create_index(op.f('ix_chats_user_id'), 'chats', ['user_id'], unique=False)

    # ------------------------------------------------------------------
    # Create messages table
    # ------------------------------------------------------------------
    op.create_table(
        'messages',
        sa.Column('id',         sa.Integer(),                  nullable=False),
        sa.Column('chat_id',    sa.Integer(),                  nullable=False),
        sa.Column('role',       sa.String(),                   nullable=False),  # 'user' or 'assistant'
        sa.Column('content',    sa.Text(),                     nullable=False),
        sa.Column('sources',    sa.JSON(),                     nullable=True),   # citations list
        sa.Column('created_at', sa.DateTime(timezone=True),   nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_messages_id'),      'messages', ['id'],      unique=False)
    op.create_index(op.f('ix_messages_chat_id'), 'messages', ['chat_id'], unique=False)


def downgrade() -> None:
    """
    Drop messages first (child table), then chats (parent table).
    This order is required because of the foreign key constraint.
    """
    op.drop_index(op.f('ix_messages_chat_id'), table_name='messages')
    op.drop_index(op.f('ix_messages_id'),      table_name='messages')
    op.drop_table('messages')

    op.drop_index(op.f('ix_chats_user_id'), table_name='chats')
    op.drop_index(op.f('ix_chats_id'),      table_name='chats')
    op.drop_table('chats')
