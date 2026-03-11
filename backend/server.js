const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuration de la base de données PostgreSQL
// On utilise process.env pour que ce soit facilement configurable dans Kubernetes plus tard !
const pool = new Pool({
    user: process.env.DB_USER || 'app',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'app',
    password: process.env.DB_PASSWORD || '2OZVAvLBNe2hNM8musZ8jAON25LULINZ1kbYsuVHWacbJPKVOA7p4LK8huZtQNVW', // <-- REMPLACE CECI
    port: process.env.DB_PORT || 5432,
});

// Création automatique de la table au démarrage
const initDB = async () => {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS students (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL
      );
    `);
        console.log('✅ Table "students" prête dans PostgreSQL !');
    } catch (err) {
        console.error('❌ Erreur de base de données :', err);
    }
};
initDB();

// --- ROUTES CRUD ---

// GET : Récupérer tous les étudiants
app.get('/api/students', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM students ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST : Ajouter un étudiant
app.post('/api/students', async (req, res) => {
    const { name, email } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO students (name, email) VALUES ($1, $2) RETURNING *',
            [name, email]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE : Supprimer un étudiant
app.delete('/api/students/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM students WHERE id = $1', [id]);
        res.json({ message: `Étudiant ${id} supprimé` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lancement du serveur
app.listen(port, () => {
    console.log(`🚀 Serveur Backend en écoute sur http://localhost:${port}`);
});