<?php
/**
 * SMS Sync — process.php
 * JSON API (PHP) for demo auth, CSRF, session, and mock SMS data storage.
 * Endpoints (via JSON body "path"): /login, /logout, /session, /list, /update, /bulk
 */

declare(strict_types=1);

// ---------- Session & Security ----------
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params([
  'lifetime' => 0,
  'path'     => '/',
  'secure'   => $secure,
  'httponly' => true,
  'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');

const DEMO_EMAIL = 'isubrat@icloud.com';
const DEMO_PASS  = 'subrat@1234';
const IDLE_TIMEOUT = 1800; // 30 minutes
const DATA_FILE = __DIR__ . '/data.json';

// ---------- Helpers ----------
function respond(int $code, array $payload): void {
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

function user_logged_in(): bool {
  return isset($_SESSION['user']) && is_array($_SESSION['user']);
}

function ensure_session_active_or_401(): void {
  if (!user_logged_in()) {
    respond(401, ['ok' => false, 'error' => 'Not authenticated']);
  }
  // Idle timeout
  $now = time();
  if (!isset($_SESSION['last_activity'])) $_SESSION['last_activity'] = $now;
  if (($now - (int)$_SESSION['last_activity']) > IDLE_TIMEOUT) {
    session_unset(); session_destroy();
    respond(401, ['ok' => false, 'error' => 'Session expired']);
  }
  $_SESSION['last_activity'] = $now;
}

function get_csrf(): string {
  if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
  }
  return $_SESSION['csrf'];
}

function require_csrf(?string $token): void {
  if (!is_string($token) || !hash_equals(get_csrf(), $token)) {
    respond(403, ['ok' => false, 'error' => 'Invalid CSRF token']);
  }
}

/**
 * Load database (array of messages). If not exists, seed it.
 * @return array<int, array<string, mixed>>
 */
function db_load(): array {
  if (!file_exists(DATA_FILE)) {
    $seed = [
      [
        "id" => "msg_1001",
        "sender" => "HDFC Bank",
        "senderId" => "HDFCBK",
        "phone" => "VK-HDFCBK",
        "body" => "Rs. 2,450.00 spent on your HDFC Credit Card at AMAZON on 04-Sep 14:32. Avl limit: Rs. 37,550.00. If not you, call 1800-xxx-xxx.",
        "timestamp" => "2025-09-04T09:02:00Z",
        "read" => false,
        "starred" => true,
        "archived" => false,
        "trashed" => false,
        "tags" => ["Bank", "Txn"]
      ],
      [
        "id" => "msg_1002",
        "sender" => "Airtel",
        "senderId" => "AIRTEL",
        "phone" => "AX-AIRTEL",
        "body" => "Your OTP is 482193 for login. Do not share with anyone. Valid for 10 minutes.",
        "timestamp" => "2025-09-04T08:41:00Z",
        "read" => false,
        "starred" => false,
        "archived" => false,
        "trashed" => false,
        "tags" => ["OTP"]
      ],
      [
        "id" => "msg_1003",
        "sender" => "Flipkart",
        "senderId" => "FLPKRT",
        "phone" => "AD-FLPKRT",
        "body" => "Item delivered: Apple AirPods (3rd Gen). Rate your experience.",
        "timestamp" => "2025-09-03T19:10:00Z",
        "read" => true,
        "starred" => false,
        "archived" => false,
        "trashed" => false,
        "tags" => ["Delivery"]
      ],
      [
        "id" => "msg_1004",
        "sender" => "ICICI Bank",
        "senderId" => "ICICIB",
        "phone" => "VK-ICICIB",
        "body" => "INR 15,000 credited to A/C ****1243 on 03-Sep 12:05 via IMPS. Avl bal: INR 1,24,880. Ref: 22890112.",
        "timestamp" => "2025-09-03T06:35:00Z",
        "read" => true,
        "starred" => true,
        "archived" => true,
        "trashed" => false,
        "tags" => ["Bank", "Credit"]
      ],
      [
        "id" => "msg_1005",
        "sender" => "Local Courier",
        "senderId" => "",
        "phone" => "+91 98765 43210",
        "body" => "Package attempted delivery. Please call +91 98765 43210 to reschedule.",
        "timestamp" => "2025-09-02T16:22:00Z",
        "read" => false,
        "starred" => false,
        "archived" => false,
        "trashed" => true,
        "tags" => ["Courier"]
      ],
      // Extra realistic samples
      [
        "id" => "msg_1006",
        "sender" => "Swiggy",
        "senderId" => "SWIGGY",
        "phone" => "VM-SWIGGY",
        "body" => "Order #789456 out for delivery. Rider Rahul (98765 11223) will arrive by 02:15 PM.",
        "timestamp" => "2025-09-02T08:45:00Z",
        "read" => true,
        "starred" => false,
        "archived" => false,
        "trashed" => false,
        "tags" => ["Food", "Delivery"]
      ],
      [
        "id" => "msg_1007",
        "sender" => "IRCTC",
        "senderId" => "IRCTC",
        "phone" => "BW-IRCTC",
        "body" => "PNR 1234567890 CONFIRMED. Train 12138 dep 04-Sep 18:20. Coach S5, Seat 32.",
        "timestamp" => "2025-09-01T11:05:00Z",
        "read" => true,
        "starred" => false,
        "archived" => false,
        "trashed" => false,
        "tags" => ["Travel", "Ticket"]
      ],
      [
        "id" => "msg_1008",
        "sender" => "Uber",
        "senderId" => "UBER",
        "phone" => "AD-UBER",
        "body" => "Trip completed. Fare: ₹263.50 paid via UPI. Thanks for riding with Uber.",
        "timestamp" => "2025-09-01T13:15:00Z",
        "read" => true,
        "starred" => false,
        "archived" => false,
        "trashed" => false,
        "tags" => ["Ride"]
      ],
      [
        "id" => "msg_1009",
        "sender" => "UPPCL",
        "senderId" => "UPPCL",
        "phone" => "AX-UPPCL",
        "body" => "Electricity bill ₹1,420 generated for CA 1234xxxx. Due: 10-Sep. Pay to avoid late fee.",
        "timestamp" => "2025-08-30T07:10:00Z",
        "read" => false,
        "starred" => false,
        "archived" => false,
        "trashed" => false,
        "tags" => ["Bill"]
      ],
    ];
    file_put_contents(DATA_FILE, json_encode($seed, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    return $seed;
  }

  $raw = file_get_contents(DATA_FILE);
  $data = json_decode($raw, true);
  if (!is_array($data)) $data = [];
  return $data;
}

/**
 * Persist database safely.
 * @param array<int, array<string, mixed>> $data
 */
function db_save(array $data): void {
  $json = json_encode(array_values($data), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
  if ($json === false) respond(500, ['ok' => false, 'error' => 'Failed to encode data']);
  file_put_contents(DATA_FILE, $json, LOCK_EX);
}

/**
 * Locate item by id (returns index or -1).
 */
function db_index_by_id(array $data, string $id): int {
  foreach ($data as $i => $row) {
    if (isset($row['id']) && $row['id'] === $id) return $i;
  }
  return -1;
}

/**
 * Server-side filtering per spec.
 */
function filter_items(array $items, string $filter, string $search, string $sort): array {
  $out = array_filter($items, function($it) use ($filter) {
    $trashed = !empty($it['trashed']);
    $archived = !empty($it['archived']);
    $read = !empty($it['read']);
    $starred = !empty($it['starred']);

    switch ($filter) {
      case 'all':
        return !$trashed && !$archived; // Inbox
      case 'unread':
        return !$trashed && !$archived && !$read;
      case 'starred':
        return !$trashed && $starred;   // Include archived starred? keep simple: not trashed
      case 'archived':
        return !$trashed && $archived;
      case 'trash':
        return $trashed;
      default:
        return !$trashed && !$archived;
    }
  });

  $search = trim($search);
  if ($search !== '') {
    $q = mb_strtolower($search);
    $out = array_filter($out, function($it) use ($q) {
      $hay = mb_strtolower(
        ($it['sender'] ?? '') . ' ' .
        ($it['senderId'] ?? '') . ' ' .
        ($it['phone'] ?? '') . ' ' .
        ($it['body'] ?? '') . ' ' .
        (is_array($it['tags'] ?? []) ? implode(' ', $it['tags']) : '')
      );
      return mb_strpos($hay, $q) !== false;
    });
  }

  usort($out, function($a, $b) use ($sort) {
    $ta = strtotime($a['timestamp'] ?? 'now');
    $tb = strtotime($b['timestamp'] ?? 'now');
    if ($ta === $tb) return 0;
    return ($sort === 'asc') ? $ta <=> $tb : $tb <=> $ta;
  });

  // Reindex
  return array_values($out);
}

/**
 * Apply action to a single item (mutates array item).
 */
function apply_action(array &$item, string $action): void {
  switch ($action) {
    case 'mark_read':    $item['read'] = true; break;
    case 'mark_unread':  $item['read'] = false; break;
    case 'star':         $item['starred'] = true; break;
    case 'unstar':       $item['starred'] = false; break;
    case 'archive':      $item['archived'] = true; break;
    case 'unarchive':    $item['archived'] = false; break;
    case 'trash':        $item['trashed'] = true; break;
    case 'restore':      $item['trashed'] = false; break;
    default:
      respond(400, ['ok' => false, 'error' => 'Unsupported action']);
  }
}

// ---------- Input ----------
$raw = file_get_contents('php://input');
$req = json_decode($raw, true);
if (!is_array($req)) $req = [];
$path = $req['path'] ?? null;

// ---------- Routing ----------
switch ($path) {
  case '/login': {
    $email = (string)($req['email'] ?? '');
    $pass  = (string)($req['password'] ?? '');

    // Basic validation
    if ($email === '' || $pass === '') {
      respond(400, ['ok' => false, 'error' => 'Missing credentials']);
    }

    if (hash_equals(DEMO_EMAIL, $email) && hash_equals(DEMO_PASS, $pass)) {
      // Success
      session_regenerate_id(true);
      $_SESSION['user'] = ['email' => $email];
      $_SESSION['last_activity'] = time();
      $csrf = get_csrf();
      respond(200, ['ok' => true, 'csrfToken' => $csrf]);
    } else {
      respond(401, ['ok' => false, 'error' => 'Invalid credentials']);
    }
    break;
  }

  case '/session': {
    if (user_logged_in()) {
      // Refresh idle timer but do not rotate CSRF here
      $_SESSION['last_activity'] = time();
      respond(200, ['ok' => true, 'user' => $_SESSION['user'], 'csrfToken' => get_csrf()]);
    } else {
      respond(200, ['ok' => false]);
    }
    break;
  }

  case '/logout': {
    ensure_session_active_or_401();
    require_csrf($req['csrfToken'] ?? null);
    // Destroy session
    session_unset();
    session_destroy();
    respond(200, ['ok' => true]);
    break;
  }

  case '/list': {
    ensure_session_active_or_401();
    require_csrf($req['csrfToken'] ?? null);

    $filter = is_string($req['filter'] ?? null) ? $req['filter'] : 'all';
    $search = is_string($req['search'] ?? null) ? $req['search'] : '';
    $sort   = ($req['sort'] ?? 'desc') === 'asc' ? 'asc' : 'desc';

    $items = db_load();
    $items = filter_items($items, $filter, $search, $sort);

    respond(200, ['ok' => true, 'items' => $items]);
    break;
  }

  case '/update': {
    ensure_session_active_or_401();
    require_csrf($req['csrfToken'] ?? null);

    $id     = (string)($req['id'] ?? '');
    $action = (string)($req['action'] ?? '');

    if ($id === '' || $action === '') {
      respond(400, ['ok' => false, 'error' => 'Missing id or action']);
    }

    $data = db_load();
    $idx = db_index_by_id($data, $id);
    if ($idx === -1) respond(404, ['ok' => false, 'error' => 'Message not found']);

    if ($action === 'delete_forever') {
      // Hard delete
      array_splice($data, $idx, 1);
      db_save($data);
      respond(200, ['ok' => true]);
    } else {
      $item = $data[$idx];
      apply_action($item, $action);
      $data[$idx] = $item;
      db_save($data);
      respond(200, ['ok' => true, 'item' => $item]);
    }
    break;
  }

  case '/bulk': {
    ensure_session_active_or_401();
    require_csrf($req['csrfToken'] ?? null);

    $ids    = $req['ids'] ?? [];
    $action = (string)($req['action'] ?? '');

    if (!is_array($ids) || !$ids || $action === '') {
      respond(400, ['ok' => false, 'error' => 'Missing ids or action']);
    }

    $data = db_load();
    $updated = [];
    $toDelete = [];

    foreach ($ids as $id) {
      if (!is_string($id)) continue;
      $idx = db_index_by_id($data, $id);
      if ($idx === -1) continue;

      if ($action === 'delete_forever') {
        $toDelete[] = $idx;
      } else {
        $item = $data[$idx];
        apply_action($item, $action);
        $data[$idx] = $item;
        $updated[] = $item;
      }
    }

    // Delete indexes in reverse order to preserve positions
    if ($action === 'delete_forever' && $toDelete) {
      rsort($toDelete);
      foreach ($toDelete as $i) array_splice($data, $i, 1);
    }

    db_save($data);
    respond(200, ['ok' => true, 'updated' => $updated]);
    break;
  }

  default:
    respond(404, ['ok' => false, 'error' => 'Not found']);
}
