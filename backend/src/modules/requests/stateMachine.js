const ApiError = require('../../lib/ApiError');

// The ONLY place that defines which request status changes are legal (blueprint 9.4 step 5).
const TRANSITIONS = {
  searching: ['accepted', 'cancelled', 'expired'],
  accepted: ['arrived', 'cancelled', 'searching'],
  arrived: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  expired: [],
};

const ACTIVE_STATUSES = ['searching', 'accepted', 'arrived'];

// Who may move a request into each status.
const ACTORS = {
  accepted: ['provider', 'admin'],
  arrived: ['provider'],
  completed: ['provider'],
  cancelled: ['driver', 'provider', 'admin', 'system'],
  searching: ['provider'],
  expired: ['system'],
};

// Timestamp column stamped when a request enters a status (expired has no column).
const TIMESTAMP_COLUMN = {
  accepted: 'accepted_at',
  arrived: 'arrived_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at',
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new ApiError('ZD-REQ-005', { message: `A request that is ${from} cannot become ${to}` });
  }
}

function assertActor(to, actorRole) {
  if (!(ACTORS[to] || []).includes(actorRole)) {
    throw new ApiError('ZD-REQ-007', { message: 'You are not allowed to do this on this request' });
  }
}

const isActive = (status) => ACTIVE_STATUSES.includes(status);

module.exports = { TRANSITIONS, ACTIVE_STATUSES, ACTORS, TIMESTAMP_COLUMN, canTransition, assertTransition, assertActor, isActive };
