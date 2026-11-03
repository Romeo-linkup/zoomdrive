const ratings = require('./ratings.service');

async function rate(req, res) {
  const result = await ratings.rateRequest({
    userId: req.user.id,
    requestId: Number(req.params.id),
    stars: req.body.stars,
    comment: req.body.comment,
  });
  res.ok({ myRating: result.myRating });
}

module.exports = { rate };
