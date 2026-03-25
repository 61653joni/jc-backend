const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['https://jc-sooty.vercel.app', 'http://localhost:4200'],
    credentials: true
}));
app.use(express.json());

// Configurar Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ============ CONFIGURACIÓN DE MULTER PARA IMÁGENES ============
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato no permitido. Usa JPG, PNG o WEBP'));
        }
    }
});

// ============ RUTA PARA SUBIR IMÁGENES ============
app.post('/api/upload', upload.single('imagen'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ninguna imagen' });
        }
        
        console.log('📸 Recibida imagen:', req.file.originalname);
        
        // Crear nombre único
        const extension = req.file.originalname.split('.').pop();
        const nombreUnico = `${Date.now()}-${uuidv4().substring(0, 8)}.${extension}`;
        
        // Subir a Supabase Storage
        const { data, error } = await supabase.storage
            .from('Libros')
            .upload(nombreUnico, req.file.buffer, {
                contentType: req.file.mimetype
            });
        
        if (error) {
            console.error('Error al subir a Supabase:', error);
            return res.status(500).json({ error: error.message });
        }
        
        // Obtener URL pública
        const { data: urlData } = supabase.storage
            .from('Libros')
            .getPublicUrl(nombreUnico);
        
        console.log('✅ Imagen subida:', urlData.publicUrl);
        res.json({ url: urlData.publicUrl });
        
    } catch (error) {
        console.error('Error en /api/upload:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ RUTAS DE AUTENTICACIÓN ============

// ✅ Ruta de REGISTRO
app.post('/api/auth/registro', async (req, res) => {
    const { nombre, apellido, curp, telefono, email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }
    
    try {
        const { data: existingUser } = await supabase
            .from('usuarios')
            .select('email')
            .eq('email', email)
            .single();
        
        if (existingUser) {
            return res.status(400).json({ error: 'El correo ya está registrado' });
        }
        
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

// ============ RUTAS DE LIBROS ============

// Obtener todos los libros con su categoría
app.get('/api/libros', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('libros')
            .select(`
                *,
                categorias (id, nombre, descripcion)
            `)
            .order('titulo');
        
        if (error) throw error;
        
        // Transformar para que sea más fácil de usar en el frontend
        const librosFormateados = data.map(libro => ({
            ...libro,
            categoria: libro.categorias?.nombre,
            categoria_id: libro.categoria_id,
            categoria_info: libro.categorias
        }));
        
        res.json(librosFormateados);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Obtener categorías
app.get('/api/categorias', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('categorias')
            .select('*')
            .order('nombre');
        
        if (error) throw error;
        res.json(data);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Crear un nuevo libro
app.post('/api/libros', async (req, res) => {
    const { titulo, autor, isbn, categoria_id, cantidad_total, cantidad_disponible, imagen_url } = req.body;
    
    if (!titulo || !autor) {
        return res.status(400).json({ error: 'Título y autor son obligatorios' });
    }
    
    try {
        const { data, error } = await supabase
            .from('libros')
            .insert([{
                titulo,
                autor,
                isbn: isbn || null,
                categoria_id: categoria_id || null,
                cantidad_total: cantidad_total || 1,
                cantidad_disponible: cantidad_disponible || cantidad_total || 1,
                imagen_url: imagen_url || null
            }])
            .select();
        
        if (error) throw error;
        res.status(201).json(data[0]);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Actualizar un libro
app.put('/api/libros/:id', async (req, res) => {
    const { id } = req.params;
    const { titulo, autor, isbn, categoria_id, cantidad_total, cantidad_disponible, imagen_url } = req.body;
    
    try {
        const { data, error } = await supabase
            .from('libros')
            .update({
                titulo,
                autor,
                isbn: isbn || null,
                categoria_id: categoria_id || null,
                cantidad_total,
                cantidad_disponible,
                imagen_url
            })
            .eq('id', id)
            .select();
        
        if (error) throw error;
        res.json(data[0]);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Eliminar un libro
app.delete('/api/libros/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const { error } = await supabase
            .from('libros')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        res.status(204).send();
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ INICIAR SERVIDOR ============

app.listen(PORT, () => {
    console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
});