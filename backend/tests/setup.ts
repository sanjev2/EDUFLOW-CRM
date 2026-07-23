process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/eduflow_crm_test";
process.env.SESSION_SECRET = "test-session-secret-at-least-thirty-two-characters";
process.env.FIELD_ENCRYPTION_KEY = "test-encryption-key-at-least-thirty-two-chars";
process.env.FRONTEND_URL = "http://localhost:3100";
process.env.ARGON2_MEMORY_KIB = "8192";
process.env.LOG_LEVEL = "silent";
