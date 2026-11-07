# ============================================================
# terrain.gd — زمین کویری ۲۶ کیلومتری
# یک بار نمونه‌برداری ارتفاع → مش دیداری (رنگ رأسی + نرمال تحلیلی)
# + برخورد trimesh درشت + باند + بیس‌ها + صخره‌های MultiMesh
# ============================================================
class_name Terrain
extends Node3D

const SIZE := 26000.0
const VIS_N := 385          # گرید دیداری
const COL_STRIDE := 3       # هر ۳ سلول، یک مثلث برخورد
var heights := PackedFloat32Array()
var vis_step: float
var noise := FastNoiseLite.new()
var half := SIZE / 2.0

const FRIENDLY := Vector3(-4500, 30, 0)
const ENEMY := Vector3(4800, 46, 1400)

func _init() -> void:
		noise.seed = 1337
		noise.noise_type = FastNoiseLite.TYPE_PERLIN
		noise.frequency = 1.0
		vis_step = SIZE / (VIS_N - 1)

func _base_height(x: float, z: float) -> float:
		var nx := x / SIZE * 46.0
		var nz := z / SIZE * 46.0
		var h := noise.get_noise_2d(nx, nz) * 26.0
		h += absf(noise.get_noise_2d(nx * 0.32 + 9.2, nz * 0.32 + 3.1)) * 42.0
		var wadi := noise.get_noise_2d(nx * 1.4 + 51.0, nz * 1.4 + 17.0)
		if wadi < -0.22:
				h += (wadi + 0.22) * 34.0
		h += noise.get_noise_2d(nx * 6.0 + 40.0, nz * 6.0 + 11.0) * 4.0 + 30.0
		var edge: float = maxf(absf(x), absf(z)) / half
		var wall := smoothstep(0.68, 1.0, edge)
		var ridge := 1.0 - absf(noise.get_noise_2d(nx * 2.0 + 99.0, nz * 2.0 + 7.0))
		h += wall * wall * (240.0 + ridge * ridge * 300.0)
		h = _flatten(h, x, z, FRIENDLY.x, FRIENDLY.z, 950, FRIENDLY.y)
		h = _flatten(h, x, z, ENEMY.x, ENEMY.z, 950, ENEMY.y)
		return h

func _flatten(h: float, x: float, z: float, cx: float, cz: float, r: float, elev: float) -> float:
		var d := sqrt(pow(x - cx, 2) + pow(z - cz, 2))
		if d >= r * 1.5:
				return h
		return lerpf(elev, h, smoothstep(r, r * 1.5, d))

func ground_height(x: float, z: float) -> float:
		var fx: float = clampf((x + half) / vis_step, 0.0, VIS_N - 1.001)
		var fz: float = clampf((z + half) / vis_step, 0.0, VIS_N - 1.001)
		var i := int(fx)
		var j := int(fz)
		var tx: float = fx - i
		var tz: float = fz - j
		var h00 := heights[j * VIS_N + i]
		var h10 := heights[j * VIS_N + i + 1]
		var h01 := heights[(j + 1) * VIS_N + i]
		var h11 := heights[(j + 1) * VIS_N + i + 1]
		return lerpf(lerpf(h00, h10, tx), lerpf(h01, h11, tx), tz)

func build(root: Node3D) -> void:
		# ---------- نمونه‌برداری ارتفاع ----------
		heights.resize(VIS_N * VIS_N)
		for j in VIS_N:
				var z: float = -half + j * vis_step
				for i in VIS_N:
						heights[j * VIS_N + i] = _base_height(-half + i * vis_step, z)

		# ---------- مش دیداری ----------
		var verts := PackedVector3Array()
		var norms := PackedVector3Array()
		var cols := PackedColorArray()
		verts.resize(VIS_N * VIS_N)
		norms.resize(VIS_N * VIS_N)
		cols.resize(VIS_N * VIS_N)
		for j in VIS_N:
				var z: float = -half + j * vis_step
				for i in VIS_N:
						var x: float = -half + i * vis_step
						var h: float = heights[j * VIS_N + i]
						var idx := j * VIS_N + i
						verts[idx] = Vector3(x, h, z)
						# نرمال تحلیلی از اختلاف مرکزی
						var hl := heights[j * VIS_N + maxf(i - 1, 0)]
						var hr := heights[j * VIS_N + minf(i + 1, VIS_N - 1)]
						var hd := heights[maxf(j - 1, 0) * VIS_N + i]
						var hu := heights[minf(j + 1, VIS_N - 1) * VIS_N + i]
						var n := Vector3(hl - hr, 2.0 * vis_step, hd - hu).normalized()
						norms[idx] = n
						cols[idx] = _terrain_color(x, z, h, hr - hl, hu - hd)
		var idxs := PackedInt32Array()
		idxs.resize((VIS_N - 1) * (VIS_N - 1) * 6)
		var k := 0
		for j in VIS_N - 1:
				for i in VIS_N - 1:
						var a := j * VIS_N + i
						var b := a + 1
						var c := a + VIS_N
						var d := c + 1
						idxs[k] = a; idxs[k + 1] = d; idxs[k + 2] = b
						idxs[k + 3] = a; idxs[k + 4] = c; idxs[k + 5] = d
						k += 6
		var arr := []
		arr.resize(Mesh.ARRAY_MAX)
		arr[Mesh.ARRAY_VERTEX] = verts
		arr[Mesh.ARRAY_NORMAL] = norms
		arr[Mesh.ARRAY_COLOR] = cols
		arr[Mesh.ARRAY_INDEX] = idxs
		var mesh := ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)

		var mat := StandardMaterial3D.new()
		mat.albedo_texture = _detail_texture()
		mat.vertex_color_use_as_albedo = true
		mat.roughness = 0.97
		mat.metallic = 0.0
		var tmi := MeshInstance3D.new()
		tmi.mesh = mesh
		tmi.material_override = mat
		root.add_child(tmi)

		# ---------- برخورد trimesh درشت ----------
		var cverts := PackedVector3Array()
		var cn := int((VIS_N - 1) / float(COL_STRIDE)) + 1
		for j in cn:
				for i in cn:
						var gi: int = minf(i * COL_STRIDE, VIS_N - 1)
						var gj: int = minf(j * COL_STRIDE, VIS_N - 1)
						cverts.append(verts[gj * VIS_N + gi])
		var cidx := PackedInt32Array()
		for j in cn - 1:
				for i in cn - 1:
						var a := j * cn + i
						var b := a + 1
						var c := a + cn
						var d := c + 1
						cidx.append_array([a, d, b, a, c, d])
		var cshape := ConcavePolygonShape3D.new()
		cshape.set_faces(cverts)
		cshape.backface_collision = true
		var cbody := StaticBody3D.new()
		var ccs := CollisionShape3D.new()
		ccs.shape = cshape
		cbody.add_child(ccs)
		root.add_child(cbody)

		# ---------- باند و بیس‌ها ----------
		_build_base(root, FRIENDLY, true)
		_build_base(root, ENEMY, false)

		# ---------- صخره‌ها ----------
		var rock_mesh := SphereMesh.new()
		rock_mesh.radius = 1.0
		rock_mesh.height = 1.6
		rock_mesh.radial_segments = 6
		rock_mesh.rings = 3
		var rock_mat := StandardMaterial3D.new()
		rock_mat.albedo_color = Color(0.42, 0.33, 0.27)
		rock_mat.roughness = 1.0
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = rock_mesh
		mm.instance_count = 220
		var rng := RandomNumberGenerator.new()
		rng.seed = 7
		var placed := 0
		var guard := 0
		while placed < 220 and guard < 3000:
				guard += 1
				var x := rng.randf_range(-half * 0.42, half * 0.42)
				var z := rng.randf_range(-half * 0.42, half * 0.42)
				var h := ground_height(x, z)
				if h > 130 or x > FRIENDLY.x - 1100 and x < FRIENDLY.x + 1100 and absf(z) < 1100:
						continue
				if x > ENEMY.x - 1100 and x < ENEMY.x + 1100 and z > ENEMY.z - 1100 and z < ENEMY.z + 1100:
						continue
				var sc := rng.randf_range(2.5, 11.0)
				var t := Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(sc, sc * rng.randf_range(0.6, 1.3), sc)),
								Vector3(x, h + sc * 0.2, z))
				mm.set_instance_transform(placed, t)
				placed += 1
		mm.visible_instance_count = placed
		var rmi := MultiMeshInstance3D.new()
		rmi.multimesh = mm
		rmi.material_override = rock_mat
		root.add_child(rmi)

func _terrain_color(x: float, z: float, h: float, dhx: float, dhz: float) -> Color:
		var mott := noise.get_noise_2d(x * 0.0045 + 77.0, z * 0.0045 + 13.0)
		var streak := noise.get_noise_2d(x * 0.0012 - 5.0, z * 0.012 + 31.0)
		var slope: float = clampf((absf(dhx) + absf(dhz)) / (vis_step * 0.35), 0.0, 1.0)
		var c := Color(0.74 + mott * 0.09 + streak * 0.06, 0.60 + mott * 0.08 + streak * 0.05, 0.40 + mott * 0.05)
		if h < 34:
				c = c.lerp(Color(0.70, 0.66, 0.58), clampf((34.0 - h) / 16.0, 0, 1) * 0.8)
		if h > 95:
				c = c.lerp(Color(0.55, 0.45, 0.36), clampf((h - 95.0) / 60.0, 0, 1) * 0.72)
		c = c.lerp(Color(0.42, 0.33, 0.27), slope * 0.92)
		if h > 150:
				c = c.lerp(Color(0.80, 0.78, 0.76), clampf((h - 150.0) / 120.0, 0, 1) * 0.85)
		return c

func _build_base(root: Node3D, base: Vector3, friendly: bool) -> void:
		var y := base.y
		var rw := MeshInstance3D.new()
		var rb := BoxMesh.new()
		rb.size = Vector3(46, 0.4, 2600)
		rw.mesh = rb
		rw.position = Vector3(base.x, y + 0.2, base.z)
		var rmat := StandardMaterial3D.new()
		rmat.roughness = 0.95
		rmat.albedo_color = Color(0.24, 0.25, 0.26)
		if friendly:
				rmat.albedo_texture = _runway_texture()
		rw.material_override = rmat
		root.add_child(rw)
		var bmat := StandardMaterial3D.new()
		bmat.albedo_color = Color(0.43, 0.40, 0.35)
		bmat.roughness = 0.9
		for i in 4:
				var hg := MeshInstance3D.new()
				var hb := BoxMesh.new()
				hb.size = Vector3(44, 15, 36)
				hg.mesh = hb
				var ox: float
				var oz: float
				if friendly:
						ox = 130 + (i % 2) * 60
						oz = -960 + i * 55
				else:
						ox = -130 + (i % 2) * 90
						oz = -700 + floorf(i / 2.0) * 320
				hg.position = Vector3(base.x + ox, y + 7.5, base.z + oz)
				hg.material_override = bmat
				hg.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
				root.add_child(hg)
		var tower := MeshInstance3D.new()
		var tc := CylinderMesh.new()
		tc.top_radius = 3
		tc.bottom_radius = 4.5
		tc.height = 34
		tower.mesh = tc
		tower.position = Vector3(base.x + 40, y + 17, base.z - 80)
		tower.material_override = bmat
		root.add_child(tower)

func _runway_texture() -> ImageTexture:
		var img := Image.create(128, 1024, false, Image.FORMAT_RGBA8)
		img.fill(Color(0.24, 0.25, 0.26))
		var rng := RandomNumberGenerator.new()
		rng.seed = 5
		for i in 3000:
				var v := rng.randf_range(0.20, 0.30)
				img.set_pixel(rng.randi_range(0, 127), rng.randi_range(0, 1023), Color(v, v, v + 0.01))
		for x in range(8, 15):
				for y in 1024:
						img.set_pixel(x, y, Color(0.9, 0.9, 0.85))
						img.set_pixel(127 - x, y, Color(0.9, 0.9, 0.85))
		for y in range(0, 1020, 60):
				for x in range(62, 67):
						for dy in 3:
								img.set_pixel(x, y + dy, Color(0.85, 0.85, 0.8))
		var t := ImageTexture.create_from_image(img)
		return t

func _detail_texture() -> ImageTexture:
		var img := Image.create(256, 256, false, Image.FORMAT_RGBA8)
		var rng := RandomNumberGenerator.new()
		rng.seed = 3
		img.fill(Color(0.86, 0.78, 0.66))
		for i in 5000:
				var v := rng.randf_range(0.72, 0.98)
				img.set_pixel(rng.randi_range(0, 255), rng.randi_range(0, 255), Color(v, v * 0.94, v * 0.78))
		for i in 24:
				var px := rng.randi_range(0, 255)
				var py := rng.randi_range(0, 255)
				var r := rng.randi_range(10, 40)
				var dark := rng.randf() < 0.5
				for y in range(max(0, py - r), min(256, py + r)):
						for x in range(max(0, px - r), min(256, px + r)):
								var d := Vector2(x - px, y - py).length() / r
								if d < 1.0:
										var cc := img.get_pixel(x, y)
										var target := 0.60 if dark else 0.96
										img.set_pixel(x, y, cc.lerp(Color(target, target * 0.94, target * 0.82), 0.30 * (1.0 - d)))
		var t := ImageTexture.create_from_image(img)
		return t
