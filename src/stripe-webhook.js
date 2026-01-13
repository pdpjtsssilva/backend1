const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
}

// Essa rota precisa ser raw body; configure no server antes do express.json para produção.
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe) {
    return res.status(501).json({ erro: 'Stripe nao configurado' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).send('Webhook secret ausente');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Erro ao verificar assinatura do webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // TODO: integrar com lógica de pagamento (corridas/carteira)
  switch (event.type) {
    case 'payment_intent.succeeded':
      // const paymentIntent = event.data.object;
      console.log('Pagamento confirmado no Stripe.');
      break;
    case 'payment_intent.payment_failed':
      console.warn('Pagamento falhou no Stripe.');
      break;
    default:
      break;
  }

  res.json({ received: true });
});

module.exports = router;
