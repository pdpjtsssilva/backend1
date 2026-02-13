const { z } = require('zod');
const validate = require('../src/middlewares/validate');

// Mock Express Request and Response
const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.body = data;
        return res;
    };
    return res;
};

const mockNext = () => {
    const next = (err) => {
        if (err) throw err;
        next.called = true;
    };
    next.called = false;
    return next;
};

async function testValidation() {
    console.log('--- Testando Middleware de Validação ---');

    const schema = z.object({
        body: z.object({
            email: z.string().email(),
        }),
    });

    // Teste 1: Sucesso
    const reqSuccess = { body: { email: 'teste@exemplo.com' } };
    const res1 = mockRes();
    const next1 = mockNext();

    validate(schema)(reqSuccess, res1, next1);
    if (next1.called) {
        console.log('✅ Teste 1 (Dados Válidos): Passou');
    } else {
        console.error('❌ Teste 1 (Dados Válidos): Falhou');
    }

    // Teste 2: Falha
    const reqFail = { body: { email: 'invalido' } };
    const res2 = mockRes();
    const next2 = mockNext();

    validate(schema)(reqFail, res2, next2);
    if (res2.statusCode === 400 && res2.body.erro === 'Dados inválidos') {
        console.log('✅ Teste 2 (Dados Inválidos): Passou (Retornou 400)');
    } else {
        console.error('❌ Teste 2 (Dados Inválidos): Falhou');
        console.log('Status:', res2.statusCode);
        console.log('Body:', res2.body);
    }
}

testValidation().catch(console.error);
