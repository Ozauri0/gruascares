// Entorno aislado para pruebas: nunca usar SMTP real ni secretos de .env.
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.JWT_SECRET = "test_secret_test_secret_test_secret_123456";
process.env.CORS_ORIGIN = "http://localhost:3000";
