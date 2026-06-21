require('dotenv').config();
const mysql = require('mysql2/promise');

async function initDatabase() {
  let connection;
  try {
    // Connect WITHOUT specifying a database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

    const dbName = process.env.DB_NAME || 'github_analyzer';

    // Create database
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Database '${dbName}' ensured.`);

    // Switch to database
    await connection.query(`USE \`${dbName}\``);

    // Create profiles table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(200),
        bio TEXT,
        avatar_url VARCHAR(500),
        location VARCHAR(200),
        company VARCHAR(200),
        blog VARCHAR(300),
        email VARCHAR(200),
        public_repos INT DEFAULT 0,
        public_gists INT DEFAULT 0,
        followers INT DEFAULT 0,
        following INT DEFAULT 0,
        account_type ENUM('User','Organization') DEFAULT 'User',
        github_created_at DATETIME,
        last_analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Table "profiles" ensured.');

    // Create repo_insights table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS repo_insights (
        id INT AUTO_INCREMENT PRIMARY KEY,
        profile_id INT NOT NULL,
        total_stars INT DEFAULT 0,
        total_forks INT DEFAULT 0,
        total_watchers INT DEFAULT 0,
        top_language VARCHAR(100),
        language_breakdown JSON,
        most_starred_repo VARCHAR(200),
        most_starred_repo_url VARCHAR(500),
        most_starred_repo_stars INT DEFAULT 0,
        avg_repo_size_kb DECIMAL(10,2) DEFAULT 0.00,
        has_readme_profile TINYINT(1) DEFAULT 0,
        analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `);
    console.log('Table "repo_insights" ensured.');

    console.log('✅ Database and tables created successfully');
    await connection.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    if (connection) {
      try { await connection.end(); } catch (e) { /* ignore */ }
    }
    process.exit(1);
  }
}

initDatabase();
