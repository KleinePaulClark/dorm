import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../middleware/validate.js';
import { isValidPhilippinePhoneNumber, isValidUsername, loginRejection, normalizePhilippinePhoneNumber, normalizeUsername } from '../controllers/authController.js';

function makeResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    }
  };
}

test('register validation accepts missing phone when required signup fields are present', () => {
  const request = {
    body: {
      first_name: 'Jake',
      last_name: 'Wonder',
      username: 'jake_wonder',
      email: 'owner@wonder.com',
      password: 'secret123',
      role: 'tenant'
    }
  };
  const response = makeResponse();
  let nextCalled = false;

  validate(['first_name', 'last_name', 'username', 'email', 'password'])(request, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, null);
});

test('Philippine phone validation requires +63 plus exactly 10 digits after the code', () => {
  assert.equal(isValidPhilippinePhoneNumber('+639123456789'), true);
  assert.equal(isValidPhilippinePhoneNumber('9123456789'), true);
  assert.equal(isValidPhilippinePhoneNumber('+63912345678'), false);
  assert.equal(isValidPhilippinePhoneNumber('+6391234567890'), false);
  assert.equal(isValidPhilippinePhoneNumber('+631234567890'), false);
  assert.equal(isValidPhilippinePhoneNumber('+63abc123456'), false);
});

test('Philippine phone numbers normalize to E.164 for SMS verification', () => {
  assert.equal(normalizePhilippinePhoneNumber('9123456789'), '+639123456789');
  assert.equal(normalizePhilippinePhoneNumber('+63 912 345 6789'), '+639123456789');
  assert.equal(normalizePhilippinePhoneNumber('09123456789'), '+639123456789');
  assert.equal(normalizePhilippinePhoneNumber('+63abc9123456789'), null);
});

test('usernames are normalized and limited to 3–30 letters, numbers, periods, and underscores', () => {
  assert.equal(normalizeUsername('  Dorm.Hive_1  '), 'dorm.hive_1');
  assert.equal(isValidUsername('dorm.hive_1'), true);
  assert.equal(isValidUsername('ab'), false);
  assert.equal(isValidUsername('this_username_is_far_too_long_for_the_limit'), false);
  assert.equal(isValidUsername('dorm-hive'), false);
  assert.equal(isValidUsername('dorm hive'), false);
});

test('suspended login requires a valid password before returning the suspension message', () => {
  const suspendedUser = { status: 'suspended' };
  assert.deepEqual(loginRejection(suspendedUser, false), { status: 401, message: 'Invalid username/email or password.' });
  assert.deepEqual(loginRejection(suspendedUser, true), {
    status: 403,
    message: 'Your account has been suspended. Please contact the administrator for assistance.'
  });
});

test('archived login requires a valid password before returning the archive notice', () => {
  const archivedUser = { status: 'archived' };
  assert.deepEqual(loginRejection(archivedUser, false), { status: 401, message: 'Invalid username/email or password.' });
  assert.deepEqual(loginRejection(archivedUser, true), {
    status: 403,
    message: 'This account has been archived and can’t sign in. Contact DormHive support if you think this is a mistake.'
  });
});

test('only approved active users continue through login', () => {
  assert.equal(loginRejection({ status: 'active', verification_status: 'approved' }, true), null);
  assert.deepEqual(loginRejection({ status: 'pending', verification_status: 'pending' }, true), {
    status: 403,
    message: 'Your account is awaiting admin verification. We will email you when it has been reviewed.'
  });
  assert.deepEqual(loginRejection({ status: 'suspended', verification_status: 'rejected' }, true), {
    status: 403,
    message: 'Your account verification was rejected. Please check your email for details or contact DormHive support.'
  });
  assert.deepEqual(loginRejection({ status: 'pending', verification_status: 'pending' }, false), {
    status: 401,
    message: 'Invalid username/email or password.'
  });
});
