# ============================================================
# weapons.gd — گلوله (بالستیک واقعی با افت)، موشک (هدایت نسبتی-تناسبی
# + موتور + فیوز مجاورت)، بمب، فلر/چف
# ============================================================
class_name Weapons
extends Node3D

const EffectsG = preload("res://scripts/combat/effects.gd")
const ISAG = preload("res://scripts/core/isa.gd")

var effects: Effects
var aircraft_list: Array = []       # Array[Aircraft]
var audio = null

# ---------- گلوله ----------
var _bullets: Array = []            # {pos, vel, t, alive, owner, dmg, node}
var _bullet_pool: Array = []
const BULLET_SPEED := 1050.0
const BULLET_LIFE := 2.2
const BULLET_DMG := 14.0

# ---------- موشک ----------
var _missiles: Array = []           # {node, vel, target, t, motor, team, owner, kind, range, trail}
const MSL := {
		"ir": {"speed": 850.0, "turn": 4.2, "dmg": 68.0, "life": 14.0, "motor": 3.2},
		"sarh": {"speed": 1050.0, "turn": 3.0, "dmg": 95.0, "life": 26.0, "motor": 4.5},
		"arh": {"speed": 1200.0, "turn": 3.4, "dmg": 110.0, "life": 34.0, "motor": 6.0},
		"sam": {"speed": 900.0, "turn": 3.6, "dmg": 85.0, "life": 22.0, "motor": 4.0},
}

# ---------- فلر/چف ----------
var _decays: Array = []             # {node, vel, t, life, kind}

var game = null
var _msl_mesh: Mesh

func _ready() -> void:
		_msl_mesh = CylinderMesh.new()
		(_msl_mesh as CylinderMesh).top_radius = 0.0
		(_msl_mesh as CylinderMesh).bottom_radius = 0.12
		(_msl_mesh as CylinderMesh).height = 2.6
		(_msl_mesh as CylinderMesh).radial_segments = 8
		var mmat := StandardMaterial3D.new()
		mmat.albedo_color = Color(0.85, 0.87, 0.9)
		mmat.metallic = 0.6
		(_msl_mesh as CylinderMesh).material = mmat

# ============================================================
# حلقه اصلی
# ============================================================
func _physics_process(dt: float) -> void:
		_update_bullets(dt)
		_update_missiles(dt)
		_update_decays(dt)

# ============================================================
# گلوله
# ============================================================
func fire_bullet(pos: Vector3, dir: Vector3, owner_ac: Aircraft) -> void:
		var vel := dir * BULLET_SPEED
		vel += owner_ac.st.vel * 0.35   # وراثت سرعت پرتابه
		var node := _get_bullet_node()
		node.global_position = pos
		node.visible = true
		_bullets.append({"pos": pos, "prev": pos, "vel": vel, "t": 0.0, "node": node, "owner": owner_ac})

func _get_bullet_node() -> MeshInstance3D:
		if _bullet_pool.size() > 0:
				return _bullet_pool.pop_back()
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.08, 0.08, 3.2)
		mi.mesh = bm
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.albedo_color = Color(1.0, 0.85, 0.4)
		m.emission_enabled = true
		m.emission = Color(1.0, 0.8, 0.35)
		m.emission_energy_multiplier = 3.0
		mi.material_override = m
		add_child(mi)
		return mi

func _update_bullets(dt: float) -> void:
		for i in range(_bullets.size() - 1, -1, -1):
				var b: Dictionary = _bullets[i]
				b.t += dt
				# بالستیک با گرانش و چگالی
				var rho: float = ISAG.density(b.pos.y)
				var drag: float = 0.00025 * rho
				b.vel += Vector3.DOWN * 9.81 * dt
				b.vel *= maxf(0.0, 1.0 - drag * b.vel.length() * dt)
				b.prev = b.pos
				b.pos += b.vel * dt
				b.node.global_position = b.pos
				if b.vel.length() > 1.0:
						b.node.global_basis = Basis.looking_at(b.vel.normalized(), Vector3.UP)
				# برخورد با هواپیماها
				var hit: Aircraft = null
				for ac in aircraft_list:
						if ac == b.owner or not ac.alive:
								continue
						if b.owner != null and ac.team == b.owner.team:
								continue
						var radius: float = ac.spec.get("len", 15.0) * 0.30
						if _seg_sphere(b.prev, b.pos, ac.global_position, radius):
								hit = ac
								break
				if hit != null:
						hit.take_hit(BULLET_DMG, b.owner)
						if effects != null:
								effects.explosion(b.pos, 0.25)
						b.t = 99.0
				if b.t > BULLET_LIFE or b.pos.y < TerrainHelper.ground_y(b.pos):
						b.t = 99.0
				if b.t >= 99.0:
						b.node.visible = false
						_bullet_pool.append(b.node)
						_bullets.remove_at(i)

# ============================================================
# موشک
# ============================================================
func launch_missile(pos: Vector3, inherit_vel: Vector3, target: Aircraft, owner_ac, kind: String, _range: float) -> void:
		var node := MeshInstance3D.new()
		node.mesh = _msl_mesh
		add_child(node)
		node.global_position = pos
		node.global_basis = Basis.looking_at((-inherit_vel).normalized() if inherit_vel.length() > 1 else Vector3.FORWARD, Vector3.UP)
		var trail := GPUParticles3D.new()
		trail.amount = 90
		trail.lifetime = 1.4
		var pm := ParticleProcessMaterial.new()
		pm.direction = Vector3(0, 0, 1)
		pm.spread = 4.0
		pm.initial_velocity_min = 0.5
		pm.initial_velocity_max = 2.0
		pm.gravity = Vector3.ZERO
		pm.scale_min = 2.0
		pm.scale_max = 4.5
		pm.color_ramp = _grad_tex(_msl_trail_gradient())
		trail.process_material = pm
		var qm := QuadMesh.new()
		qm.size = Vector2(1.0, 1.0)
		var qmat := StandardMaterial3D.new()
		qmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		qmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		qmat.albedo_texture = _smoke_tex()
		qmat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		qmat.vertex_color_use_as_albedo = true
		qm.material = qmat
		trail.draw_pass_1 = qm
		node.add_child(trail)
		trail.emitting = true
		var spec: Dictionary = MSL.get(kind, MSL["ir"])
		_missiles.append({
				"node": node, "trail": trail, "vel": inherit_vel + (-node.global_basis.z) * 60.0,
				"target": target, "t": 0.0, "motor": spec.motor, "life": spec.life,
				"speed": spec.speed, "turn": spec.turn, "dmg": spec.dmg,
				"owner": owner_ac, "kind": kind,
		})

func _update_missiles(dt: float) -> void:
		for i in range(_missiles.size() - 1, -1, -1):
				var m: Dictionary = _missiles[i]
				m.t += dt
				var target: Aircraft = m.target
				var detonate := false
				# هدف معتبر؟
				if target == null or not is_instance_valid(target) or not target.alive:
						target = null
						m.target = null
				# هدایت
				var vel: Vector3 = m.vel
				var spd: float = vel.length()
				if m.t < m.motor:
						spd = minf(spd + m.speed * dt / maxf(m.motor, 0.1), m.speed + 300)
				# فیوز مجاورت
				if target != null:
						var to_t: Vector3 = target.global_position - m.node.global_position
						var d := to_t.length()
						if d < 16.0 or _seg_sphere(m.get("prev_pos", m.node.global_position), m.node.global_position, target.global_position, target.spec.get("len", 15.0) * 0.38):
								detonate = true
						else:
								# نقطه پیشروی
								var closing: float = clampf(d / maxf(spd, 100.0), 0.0, 6.0)
								var aim: Vector3 = target.global_position + target.st.vel * closing * 0.85
								var want: Vector3 = (aim - m.node.global_position).normalized()
								var cur := vel.normalized()
								# چرخش محدود (نسبی-تناسبی ساده‌شده)
								var max_turn: float = m.turn * dt
								var new_dir := cur.slerp(want, clampf(max_turn, 0.0, 1.0)).normalized()
								vel = new_dir * spd
						# فلر: اگر فلر فعال نزدیک خط دید باشد، شانس گم کردن
						if target != null and m.kind == "ir" and _flare_decoy(m, target):
								m.target = null
				else:
						vel = vel * (1.0 - 0.1 * dt)
				vel += Vector3.DOWN * 4.0 * dt * (0.0 if m.t < m.motor else 1.0)
				m.vel = vel
				m.prev_pos = m.node.global_position
				m.node.global_position += vel * dt
				if vel.length() > 1.0:
						m.node.global_basis = Basis.looking_at(vel.normalized(), Vector3.UP)
				# برخورد زمین
				if m.node.global_position.y < TerrainHelper.ground_y(m.node.global_position):
						detonate = true
				if detonate:
						if effects != null:
								effects.explosion(m.node.global_position, 1.4)
						# آسیب مجاورت
						var hit: Aircraft = m.target
						if hit != null and is_instance_valid(hit) and hit.alive:
								var d2: float = hit.global_position.distance_to(m.node.global_position)
								if d2 < 60.0:
										hit.take_hit(m.dmg * (1.0 - d2 / 70.0), m.owner)
						m.node.queue_free()
						_missiles.remove_at(i)
						continue
				if m.t > m.life:
						m.node.queue_free()
						_missiles.remove_at(i)

func _flare_decoy(m: Dictionary, target: Aircraft) -> bool:
		for d in _decays:
				if d.kind != "flare" or d.t > 1.2:
						continue
				if d.pos.distance_to(target.global_position) < 120.0:
						if randf() < 0.35:
								return true
		return false

# ============================================================
# بمب / فلر / چف
# ============================================================
func drop_bomb(pos: Vector3, vel: Vector3, owner_ac: Aircraft) -> void:
		var node := MeshInstance3D.new()
		var bm := CylinderMesh.new()
		bm.top_radius = 0.2
		bm.bottom_radius = 0.2
		bm.height = 1.4
		node.mesh = bm
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.3, 0.3, 0.28)
		node.material_override = mat
		add_child(node)
		node.global_position = pos
		_decays.append({"node": node, "vel": vel, "t": 0.0, "life": 30.0, "kind": "bomb", "owner": owner_ac})

func drop_flares(pos: Vector3, vel: Vector3) -> void:
		for i in 8:
				var node := MeshInstance3D.new()
				var sm := SphereMesh.new()
				sm.radius = 0.5
				sm.height = 1.0
				node.mesh = sm
				var mat := StandardMaterial3D.new()
				mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
				mat.albedo_color = Color(1.0, 0.75, 0.3)
				mat.emission_enabled = true
				mat.emission = Color(1.0, 0.7, 0.25)
				mat.emission_energy_multiplier = 5.0
				node.material_override = mat
				add_child(node)
				node.global_position = pos
				var v := vel * 0.6 + Vector3(randf_range(-25, 25), randf_range(-8, 4), randf_range(-25, 25))
				_decays.append({"node": node, "vel": v, "t": 0.0, "life": 4.2, "kind": "flare", "pos": pos})

func drop_chaff(pos: Vector3, vel: Vector3) -> void:
		for i in 4:
				var node := MeshInstance3D.new()
				var sm := SphereMesh.new()
				sm.radius = 0.4
				sm.height = 0.8
				node.mesh = sm
				var mat := StandardMaterial3D.new()
				mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
				mat.albedo_color = Color(0.8, 0.85, 0.9, 0.7)
				mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				node.material_override = mat
				add_child(node)
				node.global_position = pos
				var v := vel * 0.5 + Vector3(randf_range(-18, 18), randf_range(2, 10), randf_range(-18, 18))
				_decays.append({"node": node, "vel": v, "t": 0.0, "life": 3.0, "kind": "chaff", "pos": pos})

func _update_decays(dt: float) -> void:
		for i in range(_decays.size() - 1, -1, -1):
				var d: Dictionary = _decays[i]
				d.t += dt
				var node: MeshInstance3D = d.node
				if d.kind == "flare":
						d.vel *= 1.0 - 0.7 * dt
						d.vel.y -= 9.81 * dt * 0.5
						node.global_position += d.vel * dt
						if effects != null and randf() < 0.4:
								pass
						d.pos = node.global_position
				elif d.kind == "chaff":
						d.vel *= 1.0 - 1.4 * dt
						d.vel.y -= 4.0 * dt
						node.global_position += d.vel * dt
						d.pos = node.global_position
				else:
						d.vel.y -= 9.81 * dt
						node.global_position += d.vel * dt
						if node.global_position.y < TerrainHelper.ground_y(node.global_position):
								if effects != null:
										effects.explosion(node.global_position, 2.0)
								if game != null:
										game.on_bomb_impact(node.global_position, d.owner)
								node.queue_free()
								_decays.remove_at(i)
								continue
				if d.t > d.life:
						node.queue_free()
						_decays.remove_at(i)

# ============================================================
# کمکی
# ============================================================
func _grad_tex(g: Gradient) -> Texture2D:
	var t := GradientTexture1D.new()
	t.gradient = g
	return t

func _smoke_tex() -> Texture2D:
		var img := Image.create(64, 64, false, Image.FORMAT_RGBA8)
		for y in 64:
				for x in 64:
						var d := Vector2(x - 32, y - 32).length() / 30.0
						var a: float = clampf(1.0 - d, 0.0, 1.0)
						img.set_pixel(x, y, Color(0.75, 0.73, 0.7, a * a * 0.55))
		return ImageTexture.create_from_image(img)

func _msl_trail_gradient() -> Gradient:
		var g := Gradient.new()
		g.set_color(0, Color(0.9, 0.9, 0.9, 0.75))
		g.add_point(0.4, Color(0.75, 0.73, 0.7, 0.4))
		g.set_color(1, Color(0.6, 0.6, 0.6, 0.0))
		return g

func _build_missile_mesh() -> Mesh:
		return _msl_mesh

func active_missile_targeting(ac: Aircraft) -> Dictionary:
		# نزدیک‌ترین موشک در حال تعقیب این هواپیما
		var best := {}
		var bd := 1e12
		for m in _missiles:
				if m.target == ac:
						var d: float = m.node.global_position.distance_to(ac.global_position)
						if d < bd:
								bd = d
								best = {"missile": m, "dist": d}
		return best

func any_missile_inbound(ac: Aircraft) -> bool:
		for m in _missiles:
				if m.target == ac:
						return true
		return false

# Helper ارتفاع زمین — تزریق می‌شود (چرخه وابستگی با Terrain)
func _seg_sphere(a: Vector3, b: Vector3, c: Vector3, r: float) -> bool:
		var ab := b - a
		var len2 := ab.length_squared()
		var t := 0.0
		if len2 > 0.0001:
				t = clampf((c - a).dot(ab) / len2, 0.0, 1.0)
		var closest := a + ab * t
		return closest.distance_squared_to(c) <= r * r

class TerrainHelper:
		static var ground_fn: Callable = Callable()
		static func ground_y(p: Vector3) -> float:
				if ground_fn.is_valid():
						return ground_fn.call(p.x, p.z)
				return 0.0
