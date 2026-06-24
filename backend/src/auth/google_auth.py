import os
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from dotenv import load_dotenv

load_dotenv()

# Google OAuth Client ID provided in the credentials
GOOGLE_CLIENT_ID = os.getenv(
    "GOOGLE_CLIENT_ID",
    "10example--99-0a29fr7khu9enotreal60.apps.googleusercontent.com"
)

def verify_google_token(token: str) -> dict:
    """
    Verifies a Google ID token against Google's OAuth 2.0 servers.
    Returns the user profile payload if valid, otherwise raises a ValueError.
    """
    try:
        # Verify the ID token using Google request transport
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
        
        # Ensure token was issued for our application
        if idinfo["aud"] != GOOGLE_CLIENT_ID:
            raise ValueError("Token audience mismatch.")
            
        # Ensure issuer is Google
        if idinfo["iss"] not in ["accounts.google.com", "https://accounts.google.com"]:
            raise ValueError("Token issuer invalid.")
            
        return idinfo
    except ValueError as e:
        print(f"[ERROR] Google token verification failed: {e}")
        raise ValueError(f"Invalid Google ID token: {str(e)}")
