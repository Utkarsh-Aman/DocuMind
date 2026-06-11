from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.orm import Session
from src.database.connection import get_db
from src.database.models import User
from .jwt_auth import decode_access_token

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Checks for JWT credentials in either the Authorization Bearer header
    or the 'access_token' HttpOnly cookie. Returns the User model if authenticated.
    """
    token = None
    
    # 1. Try reading token from Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        
    # 2. Try reading token from HttpOnly cookie
    if not token:
        token = request.cookies.get("access_token")
        
    # If no token is provided, raise 401 Unauthorized
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Decode and validate token payload
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid. Please log in again.",
        )
        
    # Extract database user ID from payload
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication payload.",
        )
        
    # Fetch user from PostgreSQL
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
        )
        
    return user
