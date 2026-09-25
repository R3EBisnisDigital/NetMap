#!/usr/bin/env python3
"""
NetMap Backend Auth & Upload Test Suite
Tests authentication, authorization, and file upload functionality
"""

import requests
import json
import sys
from pathlib import Path
from typing import Dict, Any, Optional

# Backend URL from frontend/.env
BASE_URL = "https://node-flow-9.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# Test file path
TEST_DRAWIO_FILE = "/tmp/drawio/graha.drawio"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def log_test(test_name: str, status: str, details: str = ""):
    """Log test results with color coding"""
    color = Colors.GREEN if status == "PASS" else Colors.RED if status == "FAIL" else Colors.YELLOW
    print(f"{color}[{status}]{Colors.END} {test_name}")
    if details:
        print(f"      {details}")

def test_login_success():
    """Test 1: POST /api/auth/login with correct credentials"""
    try:
        payload = {
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        }
        response = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if "token" in data and "user" in data:
                user = data.get("user", {})
                if user.get("username") == ADMIN_USERNAME and user.get("role") == "admin":
                    log_test("POST /api/auth/login (valid creds)", "PASS", 
                            f"Token received, user: {user.get('username')}, role: {user.get('role')}")
                    return True, data.get("token")
                else:
                    log_test("POST /api/auth/login (valid creds)", "FAIL", 
                            f"Invalid user data: {user}")
                    return False, None
            else:
                log_test("POST /api/auth/login (valid creds)", "FAIL", 
                        f"Missing token or user in response: {data}")
                return False, None
        else:
            log_test("POST /api/auth/login (valid creds)", "FAIL", 
                    f"Status code: {response.status_code}, Response: {response.text}")
            return False, None
    except Exception as e:
        log_test("POST /api/auth/login (valid creds)", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_login_failure():
    """Test 2: POST /api/auth/login with wrong credentials"""
    try:
        payload = {
            "username": "wronguser",
            "password": "wrongpassword"
        }
        response = requests.post(f"{BASE_URL}/auth/login", json=payload, timeout=10)
        
        if response.status_code == 401:
            log_test("POST /api/auth/login (invalid creds)", "PASS", 
                    "Correctly returns 401 for invalid credentials")
            return True
        else:
            log_test("POST /api/auth/login (invalid creds)", "FAIL", 
                    f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        log_test("POST /api/auth/login (invalid creds)", "FAIL", f"Exception: {str(e)}")
        return False

def test_auth_me_with_token(token: str):
    """Test 3: GET /api/auth/me with Bearer token"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if "user" in data:
                user = data.get("user", {})
                if user.get("username") == ADMIN_USERNAME and user.get("role") == "admin":
                    log_test("GET /api/auth/me (with token)", "PASS", 
                            f"User verified: {user.get('username')}, role: {user.get('role')}")
                    return True
                else:
                    log_test("GET /api/auth/me (with token)", "FAIL", 
                            f"Invalid user data: {user}")
                    return False
            else:
                log_test("GET /api/auth/me (with token)", "FAIL", 
                        f"Missing user in response: {data}")
                return False
        else:
            log_test("GET /api/auth/me (with token)", "FAIL", 
                    f"Status code: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        log_test("GET /api/auth/me (with token)", "FAIL", f"Exception: {str(e)}")
        return False

def test_auth_me_without_token():
    """Test 4: GET /api/auth/me without token"""
    try:
        response = requests.get(f"{BASE_URL}/auth/me", timeout=10)
        
        if response.status_code == 401:
            log_test("GET /api/auth/me (no token)", "PASS", 
                    "Correctly returns 401 without token")
            return True
        else:
            log_test("GET /api/auth/me (no token)", "FAIL", 
                    f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        log_test("GET /api/auth/me (no token)", "FAIL", f"Exception: {str(e)}")
        return False

def test_get_maps_public():
    """Test 5: GET /api/maps without token (public endpoint)"""
    try:
        response = requests.get(f"{BASE_URL}/maps", timeout=10)
        
        if response.status_code == 200:
            maps = response.json()
            if isinstance(maps, list):
                log_test("GET /api/maps (no token - public)", "PASS", 
                        f"Public access works, found {len(maps)} maps")
                return True, maps
            else:
                log_test("GET /api/maps (no token - public)", "FAIL", 
                        f"Expected list, got {type(maps)}")
                return False, None
        else:
            log_test("GET /api/maps (no token - public)", "FAIL", 
                    f"Status code: {response.status_code}")
            return False, None
    except Exception as e:
        log_test("GET /api/maps (no token - public)", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_create_map_without_token():
    """Test 6: POST /api/maps without token (should fail)"""
    try:
        payload = {
            "name": "Unauthorized Test Map",
            "description": "This should fail"
        }
        response = requests.post(f"{BASE_URL}/maps", json=payload, timeout=10)
        
        if response.status_code == 401:
            log_test("POST /api/maps (no token)", "PASS", 
                    "Correctly returns 401 without token")
            return True
        else:
            log_test("POST /api/maps (no token)", "FAIL", 
                    f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        log_test("POST /api/maps (no token)", "FAIL", f"Exception: {str(e)}")
        return False

def test_update_map_without_token(map_id: str):
    """Test 7: PUT /api/maps/{id} without token (should fail)"""
    try:
        payload = {
            "name": "Unauthorized Update"
        }
        response = requests.put(f"{BASE_URL}/maps/{map_id}", json=payload, timeout=10)
        
        if response.status_code == 401:
            log_test("PUT /api/maps/{id} (no token)", "PASS", 
                    "Correctly returns 401 without token")
            return True
        else:
            log_test("PUT /api/maps/{id} (no token)", "FAIL", 
                    f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        log_test("PUT /api/maps/{id} (no token)", "FAIL", f"Exception: {str(e)}")
        return False

def test_delete_map_without_token(map_id: str):
    """Test 8: DELETE /api/maps/{id} without token (should fail)"""
    try:
        response = requests.delete(f"{BASE_URL}/maps/{map_id}", timeout=10)
        
        if response.status_code == 401:
            log_test("DELETE /api/maps/{id} (no token)", "PASS", 
                    "Correctly returns 401 without token")
            return True
        else:
            log_test("DELETE /api/maps/{id} (no token)", "FAIL", 
                    f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        log_test("DELETE /api/maps/{id} (no token)", "FAIL", f"Exception: {str(e)}")
        return False

def test_add_node_without_token(map_id: str):
    """Test 9: POST /api/maps/{id}/nodes without token (should fail)"""
    try:
        payload = {
            "label": "Unauthorized Node",
            "type": "router"
        }
        response = requests.post(f"{BASE_URL}/maps/{map_id}/nodes", json=payload, timeout=10)
        
        if response.status_code == 401:
            log_test("POST /api/maps/{id}/nodes (no token)", "PASS", 
                    "Correctly returns 401 without token")
            return True
        else:
            log_test("POST /api/maps/{id}/nodes (no token)", "FAIL", 
                    f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        log_test("POST /api/maps/{id}/nodes (no token)", "FAIL", f"Exception: {str(e)}")
        return False

def test_upload_without_token():
    """Test 10: POST /api/maps/upload without token (should fail)"""
    try:
        # Check if test file exists
        if not Path(TEST_DRAWIO_FILE).exists():
            log_test("POST /api/maps/upload (no token)", "FAIL", 
                    f"Test file not found: {TEST_DRAWIO_FILE}")
            return False
        
        with open(TEST_DRAWIO_FILE, 'rb') as f:
            files = {'file': ('graha.drawio', f, 'application/xml')}
            data = {'name': 'Test Upload'}
            response = requests.post(f"{BASE_URL}/maps/upload", files=files, data=data, timeout=10)
        
        if response.status_code == 401:
            log_test("POST /api/maps/upload (no token)", "PASS", 
                    "Correctly returns 401 without token")
            return True
        else:
            log_test("POST /api/maps/upload (no token)", "FAIL", 
                    f"Expected 401, got {response.status_code}")
            return False
    except Exception as e:
        log_test("POST /api/maps/upload (no token)", "FAIL", f"Exception: {str(e)}")
        return False

def test_upload_with_token(token: str):
    """Test 11: POST /api/maps/upload WITH Bearer token"""
    try:
        # Check if test file exists
        if not Path(TEST_DRAWIO_FILE).exists():
            log_test("POST /api/maps/upload (with token)", "FAIL", 
                    f"Test file not found: {TEST_DRAWIO_FILE}")
            return False, None
        
        headers = {"Authorization": f"Bearer {token}"}
        with open(TEST_DRAWIO_FILE, 'rb') as f:
            files = {'file': ('graha.drawio', f, 'application/xml')}
            data = {'name': 'Test Upload'}
            response = requests.post(f"{BASE_URL}/maps/upload", 
                                    files=files, data=data, headers=headers, timeout=10)
        
        if response.status_code == 200:
            map_data = response.json()
            if "id" in map_data and "nodes" in map_data and "edges" in map_data:
                nodes_count = len(map_data.get("nodes", []))
                edges_count = len(map_data.get("edges", []))
                log_test("POST /api/maps/upload (with token)", "PASS", 
                        f"Upload successful. Map ID: {map_data['id']}, Nodes: {nodes_count}, Edges: {edges_count}")
                return True, map_data
            else:
                log_test("POST /api/maps/upload (with token)", "FAIL", 
                        f"Invalid response structure: {map_data}")
                return False, None
        else:
            log_test("POST /api/maps/upload (with token)", "FAIL", 
                    f"Status code: {response.status_code}, Response: {response.text}")
            return False, None
    except Exception as e:
        log_test("POST /api/maps/upload (with token)", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_delete_uploaded_map(token: str, map_id: str):
    """Test 12: DELETE the uploaded map with token"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.delete(f"{BASE_URL}/maps/{map_id}", headers=headers, timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            if result.get("ok"):
                log_test("DELETE /api/maps/{id} (with token)", "PASS", 
                        f"Successfully deleted uploaded map")
                return True
            else:
                log_test("DELETE /api/maps/{id} (with token)", "FAIL", 
                        f"Invalid response: {result}")
                return False
        else:
            log_test("DELETE /api/maps/{id} (with token)", "FAIL", 
                    f"Status code: {response.status_code}, Response: {response.text}")
            return False
    except Exception as e:
        log_test("DELETE /api/maps/{id} (with token)", "FAIL", f"Exception: {str(e)}")
        return False

def test_get_status_public(map_id: str):
    """Test 13: GET /api/maps/{id}/status without token (public endpoint)"""
    try:
        response = requests.get(f"{BASE_URL}/maps/{map_id}/status", timeout=10)
        
        if response.status_code == 200:
            status_data = response.json()
            if "mapId" in status_data and "nodes" in status_data:
                log_test("GET /api/maps/{id}/status (no token - public)", "PASS", 
                        f"Public status access works")
                return True
            else:
                log_test("GET /api/maps/{id}/status (no token - public)", "FAIL", 
                        f"Invalid response structure: {status_data}")
                return False
        else:
            log_test("GET /api/maps/{id}/status (no token - public)", "FAIL", 
                    f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("GET /api/maps/{id}/status (no token - public)", "FAIL", f"Exception: {str(e)}")
        return False

def main():
    """Run all auth tests in sequence"""
    print(f"\n{Colors.BLUE}{'='*70}{Colors.END}")
    print(f"{Colors.BLUE}NetMap Backend Auth & Upload Test Suite{Colors.END}")
    print(f"{Colors.BLUE}Testing: {BASE_URL}{Colors.END}")
    print(f"{Colors.BLUE}{'='*70}{Colors.END}\n")
    
    results = []
    token = None
    uploaded_map_id = None
    test_map_id = None
    
    # Test 1: Login with correct credentials
    success, token = test_login_success()
    results.append(success)
    
    if not token:
        print(f"\n{Colors.RED}Cannot continue tests - login failed{Colors.END}")
        return False
    
    # Test 2: Login with wrong credentials
    results.append(test_login_failure())
    
    # Test 3: GET /api/auth/me with token
    results.append(test_auth_me_with_token(token))
    
    # Test 4: GET /api/auth/me without token
    results.append(test_auth_me_without_token())
    
    # Test 5: GET /api/maps without token (public)
    success, maps = test_get_maps_public()
    results.append(success)
    
    # Get a test map ID for testing protected endpoints
    if maps and len(maps) > 0:
        test_map_id = maps[0]["id"]
    
    # Test 6: POST /api/maps without token
    results.append(test_create_map_without_token())
    
    # Test 7: PUT /api/maps/{id} without token
    if test_map_id:
        results.append(test_update_map_without_token(test_map_id))
    else:
        log_test("PUT /api/maps/{id} (no token)", "SKIP", "No map ID available")
    
    # Test 8: DELETE /api/maps/{id} without token
    if test_map_id:
        results.append(test_delete_map_without_token(test_map_id))
    else:
        log_test("DELETE /api/maps/{id} (no token)", "SKIP", "No map ID available")
    
    # Test 9: POST /api/maps/{id}/nodes without token
    if test_map_id:
        results.append(test_add_node_without_token(test_map_id))
    else:
        log_test("POST /api/maps/{id}/nodes (no token)", "SKIP", "No map ID available")
    
    # Test 10: POST /api/maps/upload without token
    results.append(test_upload_without_token())
    
    # Test 11: POST /api/maps/upload WITH token
    success, uploaded_map = test_upload_with_token(token)
    results.append(success)
    
    if uploaded_map:
        uploaded_map_id = uploaded_map.get("id")
    
    # Test 12: DELETE uploaded map with token
    if uploaded_map_id:
        results.append(test_delete_uploaded_map(token, uploaded_map_id))
    else:
        log_test("DELETE /api/maps/{id} (with token)", "SKIP", "No uploaded map to delete")
    
    # Test 13: GET /api/maps/{id}/status without token (public)
    if test_map_id:
        results.append(test_get_status_public(test_map_id))
    else:
        log_test("GET /api/maps/{id}/status (no token - public)", "SKIP", "No map ID available")
    
    # Summary
    print(f"\n{Colors.BLUE}{'='*70}{Colors.END}")
    passed = sum(results)
    total = len(results)
    percentage = (passed / total * 100) if total > 0 else 0
    
    if passed == total:
        print(f"{Colors.GREEN}✓ All tests passed! ({passed}/{total}){Colors.END}")
    else:
        print(f"{Colors.RED}✗ Some tests failed: {passed}/{total} passed ({percentage:.1f}%){Colors.END}")
    
    print(f"{Colors.BLUE}{'='*70}{Colors.END}\n")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
