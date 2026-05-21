/* ==========================================================================
   AETHER TASK PROGRAMMATIC VERIFICATION SCRIPT
   Tests Database, Cryptography, JWT Token engine, and API Server startup
   ========================================================================== */

const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');

console.log('----------------------------------------------------');
console.log('🔬 STARTING PROGRAMMATIC CODE VERIFICATION TESTS...');
console.log('----------------------------------------------------');

// Test 1: Load and test Cryptography & Custom JWT tokens in auth.js
try {
  console.log('1. Testing Auth Cryptography & JWT Engine...');
  const { hashPassword, verifyPassword, generateToken, verifyToken } = require('./auth');
  
  // Test password hashing and verification
  const pass = 'super-secret-password-123';
  const hashed = hashPassword(pass);
  console.log(`   - Password hashed: ${hashed.substring(0, 30)}...`);
  
  assert.ok(hashed.includes(':'), 'Hashed password must contain salt separator');
  assert.ok(verifyPassword(pass, hashed), 'Password verification must succeed for valid password');
  assert.ok(!verifyPassword('wrong-password', hashed), 'Password verification must fail for invalid password');
  console.log('   ✅ Hashing & timing-safe verifications work!');
  
  // Test Custom JWT Tokens
  const payload = { id: 42, username: 'testpilot', role: 'Member' };
  const token = generateToken(payload, 5); // expires in 5 seconds
  console.log(`   - JWT Generated: ${token.substring(0, 30)}...`);
  
  const decoded = verifyToken(token);
  assert.equal(decoded.id, 42, 'Decoded user ID must match');
  assert.equal(decoded.username, 'testpilot', 'Decoded username must match');
  assert.equal(decoded.role, 'Member', 'Decoded role must match');
  
  // Test token expiration
  const expiredToken = generateToken(payload, -10); // already expired 10s ago
  const decodedExpired = verifyToken(expiredToken);
  assert.equal(decodedExpired, null, 'Expired token verification must return null');
  
  // Test tampered token
  const tamperedToken = token.slice(0, -4) + 'abcd';
  const decodedTampered = verifyToken(tamperedToken);
  assert.equal(decodedTampered, null, 'Tampered signature verification must return null');
  
  console.log('   ✅ Custom JWT encodes, decodes, handles expirations and blocks tampering!');
} catch (err) {
  console.error('❌ Test 1 (Auth/Crypto) FAILED:', err.message);
  process.exit(1);
}

// Test 2: Test Database loading & tables schema in database.js
try {
  console.log('\n2. Testing SQLite Database & Seed Data...');
  const db = require('./database');
  
  // Check users count
  const users = db.prepare('SELECT id, username, email FROM users').all();
  console.log(`   - Users seeded: ${users.length}`);
  assert.ok(users.length >= 3, 'Seeded users count must be at least 3');
  assert.equal(users[0].username, 'admin', 'First user should be admin');
  
  // Check projects count
  const projects = db.prepare('SELECT id, name FROM projects').all();
  console.log(`   - Projects seeded: ${projects.length}`);
  assert.ok(projects.length >= 2, 'Seeded projects count must be at least 2');
  
  // Check tasks count
  const tasks = db.prepare('SELECT id, title, status FROM tasks').all();
  console.log(`   - Tasks seeded: ${tasks.length}`);
  assert.ok(tasks.length >= 6, 'Seeded tasks count must be at least 6');
  
  console.log('   ✅ Database schema, rigid relationships, and seeds loaded successfully!');
} catch (err) {
  console.error('❌ Test 2 (Database) FAILED:', err.message);
  process.exit(1);
}

// Test 3: Test HTTP Server boot and static/REST routing
try {
  console.log('\n3. Testing REST API Server Startup and Endpoints...');
  
  // Set ephemeral port and start server
  process.env.PORT = 3005;
  require('./server');
  
  // Wait a small bit for server socket binding
  setTimeout(() => {
    // Test GET /api/auth/me (Should return 401 Unauthorized since no cookie/header sent)
    const options = {
      hostname: 'localhost',
      port: 3005,
      path: '/api/auth/me',
      method: 'GET'
    };
    
    console.log('   - Testing GET /api/auth/me (unauthenticated)...');
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          console.log(`   - Server responded with status: ${res.statusCode}`);
          assert.equal(res.statusCode, 401, 'Unauthenticated access should return 401');
          
          const parsed = JSON.parse(data);
          assert.ok(parsed.error, 'Response should contain error object');
          console.log(`   - Response error payload: "${parsed.error}"`);
          console.log('   ✅ Server router, middlewares, and API payload parsing active!');
          
          console.log('\n----------------------------------------------------');
          console.log('🎉 ALL PROGRAMMATIC VERIFICATION TESTS PASSED SUCCESSFULLY!');
          console.log('----------------------------------------------------');
          process.exit(0);
        } catch (err) {
          console.error('❌ Test 3 (API Payload Assertions) FAILED:', err.message);
          process.exit(1);
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('❌ Test 3 (API Request Connection) FAILED:', err.message);
      process.exit(1);
    });
    
    req.end();
  }, 1000);

} catch (err) {
  console.error('❌ Test 3 (Server Boot) FAILED:', err.message);
  process.exit(1);
}
