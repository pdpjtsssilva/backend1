const { z } = require('zod');

const validate = (schema) => (req, res, next) => {
    try {
        // Valida tanto body, query quanto params, se definidos no schema
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({
                erro: 'Dados inválidos',
                detalhes: (err.errors || []).map((e) => ({
                    campo: e.path.join('.'),
                    mensagem: e.message,
                })),
            });
        }
        next(err);
    }
};

module.exports = validate;
