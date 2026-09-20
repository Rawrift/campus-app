extends Node3D

# ---- AGENT-TUNABLE PARAMETERS (plain text, no editor needed) ----
const BODY_COUNT: int = 50
const SPAWN_RADIUS: float = 6.0
const SPAWN_HEIGHT: float = 10.0
const RNG_SEED: int = 20260920
const PALETTE: Array[Color] = [
	Color(0.90, 0.29, 0.23),
	Color(0.20, 0.60, 0.86),
	Color(0.95, 0.77, 0.06),
	Color(0.18, 0.80, 0.44),
	Color(0.61, 0.35, 0.71),
]
# ----------------------------------------------------------------

var _frames: int = 0

func _ready() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = RNG_SEED

	var box := BoxMesh.new()
	box.size = Vector3(1.4, 1.4, 1.4)
	var sphere := SphereMesh.new()
	sphere.radius = 0.8
	sphere.height = 1.6

	var box_shape := BoxShape3D.new()
	box_shape.size = box.size
	var sphere_shape := SphereShape3D.new()
	sphere_shape.radius = sphere.radius

	for i in BODY_COUNT:
		var body := RigidBody3D.new()
		var use_box := rng.randf() < 0.55
		var mi := MeshInstance3D.new()
		var cs := CollisionShape3D.new()
		mi.mesh = box if use_box else sphere
		cs.shape = box_shape if use_box else sphere_shape

		var mat := StandardMaterial3D.new()
		mat.albedo_color = PALETTE[i % PALETTE.size()]
		mat.metallic = 0.85 if (i % 3 == 0) else 0.05
		mat.metallic_specular = 0.5
		mat.roughness = rng.randf_range(0.12, 0.75)
		mi.material_override = mat

		body.add_child(mi)
		body.add_child(cs)
		var a := rng.randf() * TAU
		var r := sqrt(rng.randf()) * SPAWN_RADIUS
		body.position = Vector3(cos(a) * r, SPAWN_HEIGHT + float(i) * 0.55, sin(a) * r)
		body.rotation = Vector3(rng.randf() * TAU, rng.randf() * TAU, rng.randf() * TAU)
		add_child(body)

	_make_wall(Vector3(0, 2, -20), Vector3(40, 4, 1))
	_make_wall(Vector3(0, 2, 20), Vector3(40, 4, 1))
	_make_wall(Vector3(-20, 2, 0), Vector3(1, 4, 40))
	_make_wall(Vector3(20, 2, 0), Vector3(1, 4, 40))

	_js("window.__godot_ready_ms = performance.now(); window.__godot_ready = true;")

func _make_wall(pos: Vector3, size: Vector3) -> void:
	var sb := StaticBody3D.new()
	sb.position = pos
	var m := BoxMesh.new()
	m.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.30, 0.31, 0.34)
	mat.roughness = 0.8
	mi.material_override = mat
	var cs := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	cs.shape = shape
	sb.add_child(mi)
	sb.add_child(cs)
	add_child(sb)

func _process(_d: float) -> void:
	_frames += 1
	if _frames == 5:
		_js("window.__godot_first_frames = performance.now();")
	if _frames % 10 == 0:
		_js("window.__godot_frames = %d; window.__godot_fps = %d;" % [_frames, Engine.get_frames_per_second()])

func _js(code: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(code, true)
