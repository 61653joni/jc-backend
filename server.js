const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['https://jc-sooty.vercel.app/', 'http://localhost:4200'],
    credentials: true
}));
app.use(express.json());

// Configurar Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ============ RUTAS ============

// ✅ Ruta de REGISTRO
app.post('/api/auth/registro', async (req, res) => {
    // ✅ DECLARAR LAS VARIABLES AQUÍ
    const { nombre, apellido, curp, telefono, email, password } = req.body;
    
    // Validaciones básicas
    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }
    
    try {
        // Verificar si el usuario ya existe
        const { data: existingUser } = await supabase
            .from('usuarios')
            .select('email')
            .eq('email', email)
            .single();
        
        if (existingUser) {
            return res.status(400).json({ error: 'El correo ya está registrado' });
        }
        
        // Insertar nuevo usuario
        const { data, error } = await supabase
            .from('usuarios')
            .insert([{
                nombre: nombre || null,
                apellido: apellido || null,
                curp: curp || null,
                telefono: telefono || null,
                email: email,
                password: password,
                tipo_usu: 'estudiante'
            }])
            .select();
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        // No enviamos la contraseña
        const { password: _, ...usuarioSinPassword } = data[0];
        res.status(201).json(usuarioSinPassword);
        
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Ruta de login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .single();
        
        if (error || !data) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }
        
        const { password: _, ...usuarioSinPassword } = data;
        res.json(usuarioSinPassword);
        
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Ruta para obtener usuario por email
app.get('/api/auth/me', async (req, res) => {
    const { email } = req.query;
    
    const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('email', email)
        .single();
    
    if (error || !data) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const { password: _, ...usuarioSinPassword } = data;
    res.json(usuarioSinPassword);
});

app.listen(PORT, () => {
    console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
});