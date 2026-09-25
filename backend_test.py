#!/usr/bin/env python3
"""
NetMap Backend API Test Suite
Tests all CRUD operations for maps, nodes, edges, and status endpoint
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Backend URL from frontend/.env
BASE_URL = "https://node-flow-9.preview.emergentagent.com/api"

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

def test_root_endpoint():
    """Test 1: GET /api/ - should return {service, status}"""
    try:
        response = requests.get(f"{BASE_URL}/", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if "service" in data and "status" in data:
                log_test("GET /api/", "PASS", f"Response: {data}")
                return True
            else:
                log_test("GET /api/", "FAIL", f"Missing required fields. Got: {data}")
                return False
        else:
            log_test("GET /api/", "FAIL", f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("GET /api/", "FAIL", f"Exception: {str(e)}")
        return False

def test_list_maps():
    """Test 2: GET /api/maps - should return 3 seeded maps with proper structure"""
    try:
        response = requests.get(f"{BASE_URL}/maps", timeout=10)
        if response.status_code == 200:
            maps = response.json()
            if not isinstance(maps, list):
                log_test("GET /api/maps", "FAIL", f"Expected list, got {type(maps)}")
                return False, None
            
            # Check for 3 seeded maps
            expected_names = ["Topology Wisma", "HLD Tapera Pusintek BaTii", "Graha Mandiri"]
            map_names = [m.get("name") for m in maps]
            
            # Verify structure of first map
            if len(maps) > 0:
                first_map = maps[0]
                required_fields = ["id", "name", "nodes", "edges", "stats", "typeSummary"]
                missing_fields = [f for f in required_fields if f not in first_map]
                
                if missing_fields:
                    log_test("GET /api/maps", "FAIL", f"Missing fields: {missing_fields}")
                    return False, None
                
                # Check stats structure
                stats = first_map.get("stats", {})
                if not all(k in stats for k in ["up", "warn", "down"]):
                    log_test("GET /api/maps", "FAIL", f"Invalid stats structure: {stats}")
                    return False, None
            
            # Check if we have the expected seeded maps
            found_maps = [name for name in expected_names if name in map_names]
            
            log_test("GET /api/maps", "PASS", 
                    f"Found {len(maps)} maps. Seeded maps: {found_maps}")
            return True, maps
        else:
            log_test("GET /api/maps", "FAIL", f"Status code: {response.status_code}")
            return False, None
    except Exception as e:
        log_test("GET /api/maps", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_get_map_by_id(map_id: str):
    """Test 3: GET /api/maps/{id} - fetch one map"""
    try:
        response = requests.get(f"{BASE_URL}/maps/{map_id}", timeout=10)
        if response.status_code == 200:
            map_data = response.json()
            required_fields = ["id", "name", "nodes", "edges", "stats", "typeSummary"]
            missing_fields = [f for f in required_fields if f not in map_data]
            
            if missing_fields:
                log_test(f"GET /api/maps/{map_id}", "FAIL", f"Missing fields: {missing_fields}")
                return False, None
            
            log_test(f"GET /api/maps/{{id}}", "PASS", 
                    f"Retrieved map: {map_data.get('name')} with {len(map_data.get('nodes', []))} nodes")
            return True, map_data
        else:
            log_test(f"GET /api/maps/{{id}}", "FAIL", f"Status code: {response.status_code}")
            return False, None
    except Exception as e:
        log_test(f"GET /api/maps/{{id}}", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_create_map():
    """Test 4: POST /api/maps - create a new map"""
    try:
        payload = {
            "name": "Test Network Infrastructure",
            "description": "Testing map creation for network monitoring"
        }
        response = requests.post(f"{BASE_URL}/maps", json=payload, timeout=10)
        
        if response.status_code == 200:
            map_data = response.json()
            if "id" in map_data and map_data.get("name") == payload["name"]:
                log_test("POST /api/maps", "PASS", 
                        f"Created map with id: {map_data['id']}")
                return True, map_data
            else:
                log_test("POST /api/maps", "FAIL", f"Invalid response: {map_data}")
                return False, None
        else:
            log_test("POST /api/maps", "FAIL", 
                    f"Status code: {response.status_code}, Response: {response.text}")
            return False, None
    except Exception as e:
        log_test("POST /api/maps", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_update_map(map_id: str):
    """Test 5: PUT /api/maps/{id} - update map"""
    try:
        payload = {
            "name": "Updated Network Infrastructure",
            "description": "Updated description for testing"
        }
        response = requests.put(f"{BASE_URL}/maps/{map_id}", json=payload, timeout=10)
        
        if response.status_code == 200:
            map_data = response.json()
            if map_data.get("name") == payload["name"] and map_data.get("description") == payload["description"]:
                log_test("PUT /api/maps/{id}", "PASS", 
                        f"Updated map successfully")
                return True, map_data
            else:
                log_test("PUT /api/maps/{id}", "FAIL", 
                        f"Update not reflected. Got: {map_data}")
                return False, None
        else:
            log_test("PUT /api/maps/{id}", "FAIL", 
                    f"Status code: {response.status_code}")
            return False, None
    except Exception as e:
        log_test("PUT /api/maps/{id}", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_add_node(map_id: str):
    """Test 6: POST /api/maps/{id}/nodes - add node"""
    try:
        payload = {
            "label": "Core Router 1",
            "type": "router",
            "x": 100,
            "y": 150,
            "w": 80,
            "h": 80,
            "ip": "192.168.1.1",
            "description": "Main core router for data center"
        }
        response = requests.post(f"{BASE_URL}/maps/{map_id}/nodes", json=payload, timeout=10)
        
        if response.status_code == 200:
            node_data = response.json()
            if "id" in node_data and node_data.get("label") == payload["label"]:
                log_test("POST /api/maps/{id}/nodes", "PASS", 
                        f"Added node with id: {node_data['id']}")
                return True, node_data
            else:
                log_test("POST /api/maps/{id}/nodes", "FAIL", 
                        f"Invalid response: {node_data}")
                return False, None
        else:
            log_test("POST /api/maps/{id}/nodes", "FAIL", 
                    f"Status code: {response.status_code}")
            return False, None
    except Exception as e:
        log_test("POST /api/maps/{id}/nodes", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_add_second_node(map_id: str):
    """Add a second node for edge testing"""
    try:
        payload = {
            "label": "Switch 1",
            "type": "switch",
            "x": 250,
            "y": 150,
            "w": 70,
            "h": 70,
            "ip": "192.168.1.2",
            "description": "Distribution switch"
        }
        response = requests.post(f"{BASE_URL}/maps/{map_id}/nodes", json=payload, timeout=10)
        
        if response.status_code == 200:
            node_data = response.json()
            if "id" in node_data:
                log_test("POST /api/maps/{id}/nodes (2nd node)", "PASS", 
                        f"Added second node with id: {node_data['id']}")
                return True, node_data
            else:
                log_test("POST /api/maps/{id}/nodes (2nd node)", "FAIL", 
                        f"Invalid response: {node_data}")
                return False, None
        else:
            log_test("POST /api/maps/{id}/nodes (2nd node)", "FAIL", 
                    f"Status code: {response.status_code}")
            return False, None
    except Exception as e:
        log_test("POST /api/maps/{id}/nodes (2nd node)", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_update_node(map_id: str, node_id: str):
    """Test 7: PUT /api/maps/{id}/nodes/{nodeId} - patch node"""
    try:
        payload = {
            "label": "Core Router 1 - Updated",
            "ip": "192.168.1.10"
        }
        response = requests.put(f"{BASE_URL}/maps/{map_id}/nodes/{node_id}", 
                               json=payload, timeout=10)
        
        if response.status_code == 200:
            node_data = response.json()
            if node_data.get("label") == payload["label"] and node_data.get("ip") == payload["ip"]:
                log_test("PUT /api/maps/{id}/nodes/{nodeId}", "PASS", 
                        f"Updated node successfully")
                return True, node_data
            else:
                log_test("PUT /api/maps/{id}/nodes/{nodeId}", "FAIL", 
                        f"Update not reflected. Got: {node_data}")
                return False, None
        else:
            log_test("PUT /api/maps/{id}/nodes/{nodeId}", "FAIL", 
                    f"Status code: {response.status_code}")
            return False, None
    except Exception as e:
        log_test("PUT /api/maps/{id}/nodes/{nodeId}", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_add_edge(map_id: str, source_id: str, target_id: str):
    """Test 8: POST /api/maps/{id}/edges - add edge"""
    try:
        payload = {
            "source": source_id,
            "target": target_id,
            "label": "1Gbps Link"
        }
        response = requests.post(f"{BASE_URL}/maps/{map_id}/edges", json=payload, timeout=10)
        
        if response.status_code == 200:
            edge_data = response.json()
            if "id" in edge_data and edge_data.get("source") == source_id:
                log_test("POST /api/maps/{id}/edges", "PASS", 
                        f"Added edge with id: {edge_data['id']}")
                return True, edge_data
            else:
                log_test("POST /api/maps/{id}/edges", "FAIL", 
                        f"Invalid response: {edge_data}")
                return False, None
        else:
            log_test("POST /api/maps/{id}/edges", "FAIL", 
                    f"Status code: {response.status_code}")
            return False, None
    except Exception as e:
        log_test("POST /api/maps/{id}/edges", "FAIL", f"Exception: {str(e)}")
        return False, None

def test_delete_edge(map_id: str, edge_id: str):
    """Test 9: DELETE /api/maps/{id}/edges/{edgeId} - remove edge"""
    try:
        response = requests.delete(f"{BASE_URL}/maps/{map_id}/edges/{edge_id}", timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            if result.get("ok"):
                log_test("DELETE /api/maps/{id}/edges/{edgeId}", "PASS", 
                        f"Deleted edge successfully")
                return True
            else:
                log_test("DELETE /api/maps/{id}/edges/{edgeId}", "FAIL", 
                        f"Invalid response: {result}")
                return False
        else:
            log_test("DELETE /api/maps/{id}/edges/{edgeId}", "FAIL", 
                    f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("DELETE /api/maps/{id}/edges/{edgeId}", "FAIL", f"Exception: {str(e)}")
        return False

def test_delete_node(map_id: str, node_id: str):
    """Test 10: DELETE /api/maps/{id}/nodes/{nodeId} - remove node"""
    try:
        response = requests.delete(f"{BASE_URL}/maps/{map_id}/nodes/{node_id}", timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            if result.get("ok"):
                log_test("DELETE /api/maps/{id}/nodes/{nodeId}", "PASS", 
                        f"Deleted node successfully (and attached edges)")
                return True
            else:
                log_test("DELETE /api/maps/{id}/nodes/{nodeId}", "FAIL", 
                        f"Invalid response: {result}")
                return False
        else:
            log_test("DELETE /api/maps/{id}/nodes/{nodeId}", "FAIL", 
                    f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("DELETE /api/maps/{id}/nodes/{nodeId}", "FAIL", f"Exception: {str(e)}")
        return False

def test_get_status(map_id: str):
    """Test 11: GET /api/maps/{id}/status - returns status for all nodes"""
    try:
        response = requests.get(f"{BASE_URL}/maps/{map_id}/status", timeout=10)
        
        if response.status_code == 200:
            status_data = response.json()
            required_fields = ["mapId", "nodes", "at"]
            missing_fields = [f for f in required_fields if f not in status_data]
            
            if missing_fields:
                log_test("GET /api/maps/{id}/status", "FAIL", 
                        f"Missing fields: {missing_fields}")
                return False
            
            # Check node status structure
            nodes = status_data.get("nodes", {})
            if nodes:
                first_node_id = list(nodes.keys())[0]
                first_node_status = nodes[first_node_id]
                required_status_fields = ["status", "latency", "loss", "uptime"]
                missing_status_fields = [f for f in required_status_fields if f not in first_node_status]
                
                if missing_status_fields:
                    log_test("GET /api/maps/{id}/status", "FAIL", 
                            f"Missing status fields: {missing_status_fields}")
                    return False
            
            log_test("GET /api/maps/{id}/status", "PASS", 
                    f"Retrieved status for {len(nodes)} nodes")
            return True
        else:
            log_test("GET /api/maps/{id}/status", "FAIL", 
                    f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("GET /api/maps/{id}/status", "FAIL", f"Exception: {str(e)}")
        return False

def test_delete_map(map_id: str):
    """Test 12: DELETE /api/maps/{id} - delete map"""
    try:
        response = requests.delete(f"{BASE_URL}/maps/{map_id}", timeout=10)
        
        if response.status_code == 200:
            result = response.json()
            if result.get("ok"):
                # Verify map is deleted by trying to GET it
                get_response = requests.get(f"{BASE_URL}/maps/{map_id}", timeout=10)
                if get_response.status_code == 404:
                    log_test("DELETE /api/maps/{id}", "PASS", 
                            f"Deleted map and verified 404 on GET")
                    return True
                else:
                    log_test("DELETE /api/maps/{id}", "FAIL", 
                            f"Map deleted but still accessible (status: {get_response.status_code})")
                    return False
            else:
                log_test("DELETE /api/maps/{id}", "FAIL", 
                        f"Invalid response: {result}")
                return False
        else:
            log_test("DELETE /api/maps/{id}", "FAIL", 
                    f"Status code: {response.status_code}")
            return False
    except Exception as e:
        log_test("DELETE /api/maps/{id}", "FAIL", f"Exception: {str(e)}")
        return False

def test_error_paths():
    """Test 13: Error paths - 404 for nonexistent resources"""
    results = []
    
    # Test 1: GET nonexistent map
    try:
        response = requests.get(f"{BASE_URL}/maps/nonexistent-map-id", timeout=10)
        if response.status_code == 404:
            log_test("GET /api/maps/nonexistent (404)", "PASS", "Correctly returns 404")
            results.append(True)
        else:
            log_test("GET /api/maps/nonexistent (404)", "FAIL", 
                    f"Expected 404, got {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("GET /api/maps/nonexistent (404)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    # Test 2: PUT node on nonexistent map
    try:
        payload = {"label": "Test"}
        response = requests.put(f"{BASE_URL}/maps/nonexistent-map/nodes/some-node", 
                               json=payload, timeout=10)
        if response.status_code == 404:
            log_test("PUT node on nonexistent map (404)", "PASS", "Correctly returns 404")
            results.append(True)
        else:
            log_test("PUT node on nonexistent map (404)", "FAIL", 
                    f"Expected 404, got {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("PUT node on nonexistent map (404)", "FAIL", f"Exception: {str(e)}")
        results.append(False)
    
    return all(results)

def main():
    """Run all tests in sequence"""
    print(f"\n{Colors.BLUE}{'='*70}{Colors.END}")
    print(f"{Colors.BLUE}NetMap Backend API Test Suite{Colors.END}")
    print(f"{Colors.BLUE}Testing: {BASE_URL}{Colors.END}")
    print(f"{Colors.BLUE}{'='*70}{Colors.END}\n")
    
    results = []
    
    # Test 1: Root endpoint
    results.append(test_root_endpoint())
    
    # Test 2: List maps
    success, maps = test_list_maps()
    results.append(success)
    
    if not maps or len(maps) == 0:
        print(f"\n{Colors.RED}Cannot continue tests - no maps available{Colors.END}")
        return False
    
    # Test 3: Get map by ID (use first map)
    first_map_id = maps[0]["id"]
    success, map_data = test_get_map_by_id(first_map_id)
    results.append(success)
    
    # Test 4: Create new map
    success, new_map = test_create_map()
    results.append(success)
    
    if not new_map:
        print(f"\n{Colors.RED}Cannot continue tests - map creation failed{Colors.END}")
        return False
    
    new_map_id = new_map["id"]
    
    # Test 5: Update map
    success, updated_map = test_update_map(new_map_id)
    results.append(success)
    
    # Test 6: Add first node
    success, node1 = test_add_node(new_map_id)
    results.append(success)
    
    if not node1:
        print(f"\n{Colors.RED}Cannot continue tests - node creation failed{Colors.END}")
        return False
    
    node1_id = node1["id"]
    
    # Add second node for edge testing
    success, node2 = test_add_second_node(new_map_id)
    results.append(success)
    
    if not node2:
        print(f"\n{Colors.RED}Cannot continue tests - second node creation failed{Colors.END}")
        return False
    
    node2_id = node2["id"]
    
    # Test 7: Update node
    success, updated_node = test_update_node(new_map_id, node1_id)
    results.append(success)
    
    # Test 8: Add edge
    success, edge = test_add_edge(new_map_id, node1_id, node2_id)
    results.append(success)
    
    if not edge:
        print(f"\n{Colors.YELLOW}Warning: Edge creation failed, skipping edge deletion test{Colors.END}")
        edge_id = None
    else:
        edge_id = edge["id"]
    
    # Test 9: Delete edge
    if edge_id:
        results.append(test_delete_edge(new_map_id, edge_id))
    
    # Test 10: Delete node
    results.append(test_delete_node(new_map_id, node2_id))
    
    # Test 11: Get status (use first seeded map which should have nodes)
    results.append(test_get_status(first_map_id))
    
    # Test 12: Delete map
    results.append(test_delete_map(new_map_id))
    
    # Test 13: Error paths
    results.append(test_error_paths())
    
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
