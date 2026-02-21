 const usuarioExiste = await prisma.usuario.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (usuarioExiste) {
            return res.status(400).json({ error: 'Este e-mail já está em uso.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        // Define o tipo com base na escolha do usuário, padrão PASSAGEIRO
        const tipoFinal = (tipo && tipo.toLowerCase() === 'motorista') ? 'MOTORISTA' : 'PASSAGEIRO';

        const novoUsuario = await prisma.usuario.create({
            data: {
                nome,
                email: email.toLowerCase(),
                senha: senhaHash,
                telefone,
                tipo: tipoFinal
            }
        });

        const token = jwt.sign(
            { id: novoUsuario.id, tipo: novoUsuario.tipo },
            process.env.JWT_SECRET || 'l-europe-secret-key',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Cadastro realizado com sucesso!',
            token,
            usuario: { id: novoUsuario.id, nome: novoUsuario.nome, tipo: novoUsuario.tipo }
        });

    } catch (error) {
        console.error("Erro no cadastro:", error);
        res.status(500).json({ error: 'Erro interno ao realizar cadastro.' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const usuario = await prisma.usuario.findUnique({ 
            where: { email: email.toLowerCase() } 
        });

        if (!usuario) {
            return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
        }

        const token = jwt.sign(
            { id: usuario.id, tipo: usuario.tipo },
            process.env.JWT_SECRET || 'l-europe-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            token,
            usuario: { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo }
        });
    } catch (error) {
        console.error("Erro no login:", error);
        res.status(500).json({ error: 'Erro ao realizar login.' });
    }
});

module.exports = router;