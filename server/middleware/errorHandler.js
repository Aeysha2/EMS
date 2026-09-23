export const notFound = (req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} introuvable` });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  // PostgreSQL error codes → HTTP
  const pgMap = {
    23505: [409, 'Cet enregistrement existe déjà (doublon)'],
    23503: [400, 'Référence invalide (élément lié introuvable)'],
    23514: [400, 'Valeur non autorisée'],
    '22P02': [400, 'Format de donnée invalide'],
    22007: [400, 'Date invalide'],
    22008: [400, 'Date invalide'],
  };
  if (err.code && pgMap[err.code]) {
    const [status, message] = pgMap[err.code];
    return res.status(status).json({ message, detail: err.detail });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Fichier ou requête trop volumineux' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'JSON invalide' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error('Unhandled server error:', err);
  res.status(status).json({
    message: status >= 500 ? 'Erreur interne du serveur' : err.message,
    error: process.env.NODE_ENV === 'development' && status >= 500 ? err.message : undefined,
  });
};
