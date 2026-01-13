"""
Example usage of deepsel.auth AuthManager

This example demonstrates how to use the AuthManager for user authentication,
password hashing, and permission checking.
"""

from deepsel.auth import AuthManager


def main():
    # Initialize AuthManager with a secret key
    auth = AuthManager(
        secret_key="your-secret-key-here",
        token_expiry_hours=24
    )
    
    print("=== Authentication Example ===\n")
    
    # 1. Create a token for a user
    print("1. Creating authentication token...")
    token = auth.create_token(
        user_id=123,
        username="john_doe",
        email="john@example.com",
        role="admin"
    )
    print(f"   Token created: {token}\n")
    
    # 2. Verify the token
    print("2. Verifying token...")
    payload = auth.verify_token(token)
    if payload:
        print(f"   Token valid!")
        print(f"   User ID: {payload['user_id']}")
        print(f"   Username: {payload['username']}\n")
    else:
        print("   Token invalid!\n")
    
    # 3. Password hashing
    print("3. Password hashing...")
    password = "my_secure_password_123"
    hashed = auth.hash_password(password)
    print(f"   Original: {password}")
    print(f"   Hashed: {hashed}\n")
    
    # 4. Password verification
    print("4. Password verification...")
    is_correct = auth.verify_password(password, hashed)
    print(f"   Correct password: {is_correct}")
    
    is_wrong = auth.verify_password("wrong_password", hashed)
    print(f"   Wrong password: {is_wrong}\n")
    
    # 5. Permission checking
    print("5. Permission checking...")
    roles = ["admin", "user", "guest"]
    permissions = ["read", "write", "delete", "manage"]
    
    for role in roles:
        print(f"\n   Role: {role}")
        for permission in permissions:
            has_perm = auth.check_permission(role, permission)
            status = "✓" if has_perm else "✗"
            print(f"     {status} {permission}")
    
    print("\n=== Example Complete ===")


if __name__ == "__main__":
    main()
