const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { Resend } = require('resend'); // ✅ Solo Resend
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Validar variables de entorno
const requiredEnv = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'RESEND_API_KEY',
    'FRONTEND_URL'
];

const missingVars = requiredEnv.filter(key => !process.env[key]);

if (missingVars.length > 0) {
    console.error('❌ Error: Faltan variables de entorno requeridas:');
    missingVars.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
}

console.log('✅ Variables de entorno validadas correctamente');
console.log(`   FRONTEND_URL: ${process.env.FRONTEND_URL}`);
console.log(`   RESEND_API_KEY: ${process.env.RESEND_API_KEY ? '✅ Configurado' : '❌ Faltante'}`);

// ✅ Inicializar Resend (¡Esto faltaba!)
const resend = new Resend(process.env.RESEND_API_KEY);

// Middleware
app.use(cors({
    origin: [process.env.FRONTEND_URL, 'http://localhost:4200'],
    credentials: true
}));
app.use(express.json());

// Configurar Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// ✅ Endpoint de salud (solo uno)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        supabase_configured: !!process.env.SUPABASE_URL,
        resend_configured: !!process.env.RESEND_API_KEY,
        frontend_url: process.env.FRONTEND_URL
    });
});

// ============ CONFIGURACIÓN DE MULTER PARA IMÁGENES ============
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
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

        const extension = req.file.originalname.split('.').pop();
        const nombreUnico = `${Date.now()}-${uuidv4().substring(0, 8)}.${extension}`;

        const { data, error } = await supabase.storage
            .from('Libros')
            .upload(nombreUnico, req.file.buffer, {
                contentType: req.file.mimetype
            });

        if (error) {
            console.error('Error al subir a Supabase:', error);
            return res.status(500).json({ error: error.message });
        }

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

// ============ FUNCIÓN PARA ENVIAR CORREO DE VERIFICACIÓN ============
async function sendVerificationEmail(email, nombre, token) {
    const BASE_URL = process.env.FRONTEND_URL;
    const verificationUrl = `${BASE_URL}/verify-email?token=${token}`;

    console.log(`📧 Preparando correo de verificación para: ${email}`);
    console.log(`🔗 Enlace de verificación: ${verificationUrl}`);

    try {
        const { data, error } = await resend.emails.send({
            from: 'Biblioteca JC <notificaciones@biblioteca-jc.site>',
            to: [email],
            subject: 'Confirma tu correo electrónico - Biblioteca JC',
            html: `
               <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e4e4e4; border-radius: 10px; overflow: hidden;">

  <!-- Cabecera -->
  <div style="background: #111111; padding: 28px 36px;">
    <div style="font-size: 16px; font-weight: 600; color: #ffffff; letter-spacing: 0.04em;">
      Biblioteca JC
    </div>
  </div>

  <!-- Cuerpo -->
  <div style="padding: 36px 36px 28px;">

    <h2 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #111111; letter-spacing: -0.01em;">
      Confirma tu cuenta
    </h2>
    <p style="margin: 0 0 24px; font-size: 14px; color: #888888;">
      Estás a un paso de acceder a tu biblioteca.
    </p>

    <p style="margin: 0 0 24px; font-size: 14px; color: #444444; line-height: 1.6;">
      Hola <strong style="color: #111111;">${nombre || 'usuario'}</strong>,<br>
      gracias por registrarte. Por favor confirma tu correo electrónico haciendo clic en el botón de abajo.
    </p>

    <!-- Botón principal -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="${verificationUrl}"
         style="display: inline-block; background: #111111; color: #ffffff;
                padding: 13px 32px; text-decoration: none; border-radius: 6px;
                font-size: 14px; font-weight: 600; letter-spacing: 0.03em;">
        Confirmar mi cuenta
      </a>
    </div>

    <!-- Separador -->
    <hr style="border: none; border-top: 1px solid #f0f0f0; margin: 28px 0;">

    <!-- URL alternativa -->
    <p style="margin: 0 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase;
              letter-spacing: 0.06em; color: #aaaaaa;">
      O copia este enlace en tu navegador
    </p>
    <p style="margin: 0 0 24px; background: #f7f7f7; border: 1px solid #e4e4e4;
              border-radius: 6px; padding: 10px 14px; font-size: 12px; color: #185fa5;
              word-break: break-all; line-height: 1.5;">
      ${verificationUrl}
    </p>

    <!-- Aviso de expiración -->
    <p style="margin: 0; font-size: 13px; color: #666666; line-height: 1.6;">
      Este enlace expirará en <strong style="color: #a32d2d;">24 horas</strong>.
      Si no creaste esta cuenta, puedes ignorar este correo.
    </p>

  </div>

  <!-- Pie -->
  <div style="background: #f7f7f7; border-top: 1px solid #e4e4e4; padding: 18px 36px;
              display: flex; align-items: center; justify-content: space-between;">
    <span style="font-size: 11px; color: #aaaaaa;">
      © 2024 Biblioteca JC. Todos los derechos reservados.
    </span>
  </div>

</div>
            `
        });

        if (error) {
            console.error('❌ Error de Resend:', error);
            throw error;
        }

        console.log(`✅ Correo de verificación enviado a ${email} (ID: ${data?.id})`);
        return data;

    } catch (error) {
        console.error('❌ Error al enviar correo:', error);
        throw error;
    }
}

// ============ ENDPOINT DE SALUD ============
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        supabase_configured: !!process.env.SUPABASE_URL,
        resend_configured: !!process.env.RESEND_API_KEY,
        frontend_url: process.env.FRONTEND_URL
    });
});

// ============ RUTAS DE AUTENTICACIÓN ============

// ✅ Ruta de REGISTRO con verificación
app.post('/api/auth/registro', async (req, res) => {
    const { nombre, apellido, curp, telefono, email, password } = req.body;

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

        // Generar token de verificación
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + 24);

        // Insertar usuario
        const { data, error } = await supabase
            .from('usuarios')
            .insert([{
                nombre: nombre || null,
                apellido: apellido || null,
                curp: curp || null,
                telefono: telefono || null,
                email: email,
                password: password,
                tipo_usu: 'estudiante',
                email_verified: false,
                verification_token: verificationToken,
                verification_token_expires: tokenExpiry,
                created_at: new Date()
            }])
            .select();

        if (error) {
            console.error('Error al insertar usuario:', error);
            return res.status(500).json({ error: error.message });
        }

        // Enviar correo de verificación con Resend
        await sendVerificationEmail(email, nombre, verificationToken);

        const { password: _, ...usuarioSinPassword } = data[0];
        res.status(201).json({
            message: 'Usuario registrado exitosamente. Revisa tu correo para verificar tu cuenta.',
            usuario: usuarioSinPassword
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ✅ Ruta para VERIFICAR email
app.get('/api/auth/verificar-email', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).json({ error: 'Token de verificación no proporcionado' });
    }

    try {
        const { data: user, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('verification_token', token)
            .single();

        if (error || !user) {
            return res.status(400).json({ error: 'Token de verificación inválido' });
        }

        const tokenExpiry = new Date(user.verification_token_expires);
        if (tokenExpiry < new Date()) {
            return res.status(400).json({ error: 'El enlace de verificación ha expirado. Solicita uno nuevo.' });
        }

        const { error: updateError } = await supabase
            .from('usuarios')
            .update({
                email_verified: true,
                verification_token: null,
                verification_token_expires: null
            })
            .eq('id', user.id);

        if (updateError) throw updateError;

        res.json({
            success: true,
            message: 'Email verificado exitosamente. Ya puedes iniciar sesión.'
        });

    } catch (error) {
        console.error('Error en verificación:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ✅ Ruta para REENVIAR correo de verificación
app.post('/api/auth/reenviar-verificacion', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email es obligatorio' });
    }

    try {
        const { data: user, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        if (user.email_verified) {
            return res.status(400).json({ error: 'El correo ya está verificado' });
        }

        const newToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + 24);

        await supabase
            .from('usuarios')
            .update({
                verification_token: newToken,
                verification_token_expires: tokenExpiry
            })
            .eq('id', user.id);

        await sendVerificationEmail(email, user.nombre, newToken);

        res.json({ message: 'Correo de verificación reenviado exitosamente' });

    } catch (error) {
        console.error('Error al reenviar correo:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ✅ Ruta de LOGIN con verificación de email
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !data) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        if (data.password !== password) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        if (!data.email_verified) {
            return res.status(403).json({
                error: 'Email no verificado',
                message: 'Por favor verifica tu correo electrónico antes de iniciar sesión'
            });
        }

        const { password: _, verification_token, verification_token_expires, ...usuarioSinPassword } = data;
        res.json(usuarioSinPassword);

    } catch (error) {
        console.error('Error en login:', error);
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

    const { password: _, verification_token, verification_token_expires, ...usuarioSinPassword } = data;
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
// ============ RUTAS DE PRÉSTAMOS ============

// ============ RUTAS DE PRÉSTAMOS ============

// Obtener todos los préstamos con datos relacionados
app.get('/api/prestamos', async (req, res) => {
    try {
        // Primero, obtener los préstamos
        const { data: prestamos, error: prestamosError } = await supabase
            .from('prestamos')
            .select('*')
            .order('created_at', { ascending: false });

        if (prestamosError) {
            console.error('Error al obtener préstamos:', prestamosError);
            return res.status(500).json({ error: prestamosError.message });
        }

        // Si no hay préstamos, devolver array vacío
        if (!prestamos || prestamos.length === 0) {
            return res.json([]);
        }

        // Obtener IDs únicos de libros y usuarios
        const librosIds = [...new Set(prestamos.map(p => p.id_libro))];
        const usuariosIds = [...new Set(prestamos.map(p => p.id_usuario))];

        // Obtener datos de libros
        const { data: libros, error: librosError } = await supabase
            .from('libros')
            .select('id, titulo, autor')
            .in('id', librosIds);

        if (librosError) {
            console.error('Error al obtener libros:', librosError);
        }

        // Obtener datos de usuarios
        const { data: usuarios, error: usuariosError } = await supabase
            .from('usuarios')
            .select('id, nombre, email')
            .in('id', usuariosIds);

        if (usuariosError) {
            console.error('Error al obtener usuarios:', usuariosError);
        }

        // Crear maps para búsqueda rápida
        const librosMap = new Map();
        libros?.forEach(libro => {
            librosMap.set(libro.id, libro);
        });

        const usuariosMap = new Map();
        usuarios?.forEach(usuario => {
            usuariosMap.set(usuario.id, usuario);
        });

        // Combinar los datos
        const prestamosConDetalles = prestamos.map(prestamo => ({
            ...prestamo,
            titulo: librosMap.get(prestamo.id_libro)?.titulo || 'Libro no encontrado',
            autor: librosMap.get(prestamo.id_libro)?.autor || '',
            nombre: usuariosMap.get(prestamo.id_usuario)?.nombre || 'Usuario no encontrado',
            email: usuariosMap.get(prestamo.id_usuario)?.email || ''
        }));

        console.log(`📊 Enviando ${prestamosConDetalles.length} préstamos`);
        res.json(prestamosConDetalles);

    } catch (error) {
        console.error('Error en GET /api/prestamos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Crear nuevo préstamo
app.post('/api/prestamos', async (req, res) => {
    const { id_libro, id_usuario, fecha_inicio, fecha_fin } = req.body;

    console.log('📝 Recibida solicitud de préstamo:', { id_libro, id_usuario, fecha_inicio, fecha_fin });

    if (!id_libro || !id_usuario) {
        return res.status(400).json({ error: 'Libro y usuario son obligatorios' });
    }

    if (!fecha_fin) {
        return res.status(400).json({ error: 'Fecha de devolución es obligatoria' });
    }

    try {
        // Verificar disponibilidad del libro
        const { data: libro, error: libroError } = await supabase
            .from('libros')
            .select('cantidad_disponible, cantidad_total, titulo')
            .eq('id', id_libro)
            .single();

        if (libroError || !libro) {
            console.error('Libro no encontrado:', libroError);
            return res.status(404).json({ error: 'Libro no encontrado' });
        }

        console.log(`📚 Libro: ${libro.titulo}, Disponibles: ${libro.cantidad_disponible}`);

        if (libro.cantidad_disponible <= 0) {
            return res.status(400).json({ error: 'No hay ejemplares disponibles de este libro' });
        }

        // Verificar que el usuario existe
        const { data: usuario, error: usuarioError } = await supabase
            .from('usuarios')
            .select('id, nombre')
            .eq('id', id_usuario)
            .single();

        if (usuarioError || !usuario) {
            console.error('Usuario no encontrado:', usuarioError);
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Crear préstamo
        const { data: prestamo, error: prestamoError } = await supabase
            .from('prestamos')
            .insert([{
                id_libro,
                id_usuario,
                fecha_inicio: fecha_inicio || new Date().toISOString().split('T')[0],
                fecha_fin,
                estado: 'activo'
            }])
            .select();

        if (prestamoError) {
            console.error('Error al crear préstamo:', prestamoError);
            return res.status(500).json({ error: prestamoError.message });
        }

        // Actualizar cantidad disponible del libro
        const nuevaCantidad = libro.cantidad_disponible - 1;
        const { error: updateError } = await supabase
            .from('libros')
            .update({ cantidad_disponible: nuevaCantidad })
            .eq('id', id_libro);

        if (updateError) {
            console.error('Error al actualizar cantidad:', updateError);
            // No fallamos la operación, pero registramos el error
        }

        console.log(`✅ Préstamo creado para ${usuario.nombre} - Libro: ${libro.titulo}`);
        res.status(201).json({
            success: true,
            prestamo: prestamo[0],
            message: 'Préstamo creado exitosamente'
        });

    } catch (error) {
        console.error('Error en POST /api/prestamos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Registrar devolución
app.put('/api/prestamos/:id/devolver', async (req, res) => {
    const { id } = req.params;

    try {
        // Obtener préstamo
        const { data: prestamo, error: prestamoError } = await supabase
            .from('prestamos')
            .select('*')
            .eq('id', id)
            .single();

        if (prestamoError || !prestamo) {
            return res.status(404).json({ error: 'Préstamo no encontrado' });
        }

        if (prestamo.estado !== 'activo') {
            return res.status(400).json({ error: 'Este préstamo ya fue devuelto o cancelado' });
        }

        // Actualizar préstamo
        const { error: updateError } = await supabase
            .from('prestamos')
            .update({
                estado: 'devuelto',
                fecha_devolucion: new Date().toISOString().split('T')[0]
            })
            .eq('id', id);

        if (updateError) throw updateError;

        // Aumentar cantidad disponible del libro
        const { data: libro, error: libroError } = await supabase
            .from('libros')
            .select('cantidad_disponible')
            .eq('id', prestamo.id_libro)
            .single();

        if (!libroError && libro) {
            await supabase
                .from('libros')
                .update({ cantidad_disponible: libro.cantidad_disponible + 1 })
                .eq('id', prestamo.id_libro);
        }

        res.json({ message: 'Devolución registrada exitosamente' });

    } catch (error) {
        console.error('Error en devolución:', error);
        res.status(500).json({ error: error.message });
    }
});

// Cancelar préstamo
app.put('/api/prestamos/:id/cancelar', async (req, res) => {
    const { id } = req.params;

    try {
        const { data: prestamo, error: prestamoError } = await supabase
            .from('prestamos')
            .select('*')
            .eq('id', id)
            .single();

        if (prestamoError || !prestamo) {
            return res.status(404).json({ error: 'Préstamo no encontrado' });
        }

        if (prestamo.estado !== 'activo') {
            return res.status(400).json({ error: 'Este préstamo no está activo' });
        }

        await supabase
            .from('prestamos')
            .update({ estado: 'cancelado' })
            .eq('id', id);

        // Devolver el libro al inventario
        const { data: libro, error: libroError } = await supabase
            .from('libros')
            .select('cantidad_disponible')
            .eq('id', prestamo.id_libro)
            .single();

        if (!libroError && libro) {
            await supabase
                .from('libros')
                .update({ cantidad_disponible: libro.cantidad_disponible + 1 })
                .eq('id', prestamo.id_libro);
        }

        res.json({ message: 'Préstamo cancelado' });

    } catch (error) {
        console.error('Error al cancelar:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener todos los usuarios (para el select)
app.get('/api/usuarios', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nombre, email, tipo_usu')
            .order('nombre');

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.put('/api/usuarios/:id/admin', async (req, res) => {
    const { id } = req.params;

    try {
        // Verificar que el usuario existe
        const { data: usuario, error: findError } = await supabase
            .from('usuarios')
            .select('id, tipo_usu')
            .eq('id', id)
            .single();

        if (findError || !usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Actualizar a administrador
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ tipo_usu: 'admin' })
            .eq('id', id);

        if (updateError) throw updateError;

        console.log(`👑 Usuario ${id} promovido a administrador`);
        res.json({ success: true, message: 'Usuario promovido a administrador' });

    } catch (error) {
        console.error('Error al promover a admin:', error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Bloquear usuario
app.put('/api/usuarios/:id/bloquear', async (req, res) => {
    const { id } = req.params;

    try {
        // Verificar que el usuario existe
        const { data: usuario, error: findError } = await supabase
            .from('usuarios')
            .select('id, tipo_usu')
            .eq('id', id)
            .single();

        if (findError || !usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // No permitir bloquear a otro administrador
        if (usuario.tipo_usu === 'admin') {
            return res.status(400).json({ error: 'No se puede bloquear a un administrador' });
        }

        // Actualizar estado a bloqueado
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ estado: 'bloqueado' })
            .eq('id', id);

        if (updateError) throw updateError;

        console.log(`🔒 Usuario ${id} bloqueado`);
        res.json({ success: true, message: 'Usuario bloqueado correctamente' });

    } catch (error) {
        console.error('Error al bloquear usuario:', error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Desbloquear usuario
app.put('/api/usuarios/:id/desbloquear', async (req, res) => {
    const { id } = req.params;

    try {
        // Verificar que el usuario existe
        const { data: usuario, error: findError } = await supabase
            .from('usuarios')
            .select('id')
            .eq('id', id)
            .single();

        if (findError || !usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Actualizar estado a activo
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ estado: 'activo' })
            .eq('id', id);

        if (updateError) throw updateError;

        console.log(`🔓 Usuario ${id} desbloqueado`);
        res.json({ success: true, message: 'Usuario desbloqueado correctamente' });

    } catch (error) {
        console.error('Error al desbloquear usuario:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============ INICIAR SERVIDOR ============
app.listen(PORT, () => {
    console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
});