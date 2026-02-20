// ... (resto do código anterior)

router.post('/cadastro', async (req, res) => {
    try {
        const { nome, email, senha, telefone, tipo } = req.body;

        const usuarioExiste = await prisma.usuario.findUnique({
            where: { email }
        });

        if (usuarioExiste) {
            return res.status(400).json({ error: 'Este e-mail já está em uso.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        // --- CORREÇÃO AQUI ---
        // Forçamos o 'tipo' para MAIÚSCULO para bater com o Enum do Prisma
        const tipoEnum = tipo ? tipo.toUpperCase() : 'PASSAGEIRO';

        const novoUsuario = await prisma.usuario.create({
            data: {
                nome,
                email,
                senha: senhaHash,
                telefone,
                tipo: tipoEnum // Enviará "PASSAGEIRO" ou "MOTORISTA"
            }
        });

        res.status(201).json({
            message: 'Usuário cadastrado com sucesso!',
            usuario: { id: novoUsuario.id, nome: novoUsuario.nome }
        });

    } catch (error) {
        console.error("Erro no cadastro:", error);
        res.status(500).json({ error: 'Erro ao processar o cadastro.' });
    }
});

// ... (resto do arquivo)