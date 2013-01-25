var THREE = require('three');
var voxel = require('voxel');
var ChunkMatrix = require('./lib/chunk_matrix');

function createEmptyChunk () {
    var low = [0,0,0], high = [32,32,32]
    var zeros = function (x,y,z) { return 0 }
    return voxel.generate(low, high, zeros)
}

module.exports = function (game) {
    var group = new Group;
};

function Group (game) {
    this.meshes = [];
    this.refs = {};
    this.game = game;
}

Game.prototype.checkBlock = function(pos) {
  var self = this
  var direction = self.camera.matrixWorld.multiplyVector3(new THREE.Vector3(0,0,-1))
  var start = self.controls.yawObject.position.clone()
  var d = direction.subSelf(start).normalize()

  var p = new THREE.Vector3()
  p.copy(pos)
  p.x -= 1.1 * d.x
  p.y -= 1.1 * d.y
  p.z -= 1.1 * d.z
  
  var block = self.getBlock(p)
  if (block) return false

  var voxelVector = self.voxels.voxelVector(p)
  var vidx = self.voxels.voxelIndex(voxelVector)
  var c = self.voxels.chunkAtPosition(p)
  var ckey = c.join('|')
  var chunk = self.voxels.chunks[ckey]
  if (!chunk) return false

  var pos = self.controls.yawObject.position
  var collisions = self.getCollisions(pos, {
    width: self.cubeSize / 2,
    depth: self.cubeSize / 2,
    height: self.cubeSize * 1.5
  }, check)

  if (collisions.top.length) return false
  if (collisions.middle.length) return false
  if (collisions.bottom.length > 2) return false

  function check(v) { return vidx === self.voxels.voxelIndexFromPosition(v) }

  return {chunkIndex: ckey, voxelVector: voxelVector}
}

Game.prototype.createBlock = function(pos, val) {
  var self = this
  var T = self.THREE
  var size = self.cubeSize
  var start = self.controls.yawObject.position.clone()
  
  var direction = self.camera.matrixWorld.multiplyVector3(new THREE.Vector3(0,0,-1))
  var d = direction.subSelf(start).normalize()
  
  var ray = new T.Raycaster(start, d)
  var intersections = ray.intersectObjects(self.detached.meshes)
  
  if (intersections.length) {
    var dists = intersections.map(function (i) { return i.distance })
    var inter = intersections[dists.indexOf(Math.min.apply(null, dists))]
    var ref = self.detached.refs[inter.object.id]
    if (!ref) {
      var mr = new T.Matrix4().getInverse(ref.rotationObject.matrix)
      var mt = new T.Matrix4().getInverse(ref.translationObject.matrix)
      var m = new T.Matrix4().multiply(mt, mr)
      
      return (function draw (offset) {
        var pt = new T.Vector3()
        pt.copy(inter.point)
        
        pt.x -= d.x * offset
        pt.y -= d.y * offset
        pt.z -= d.z * offset
        offset += size / 8
        
        var tr = m.multiplyVector3(pt)
        
        var ci = self.voxels.chunkAtPosition(tr)
        var vv = self.voxels.voxelVector(tr)
        var vi = self.voxels.voxelIndex(vv)
        
        var value = ref.get(ci, vi)
        console.log(ci, vi, !value)
        
        if (!value) {
          console.log('offset=' + offset)
          return ref.set(ci, vi, 3)
        }
        else draw(offset + 0.1)
      })(0.1)
    }
  }
  
  var newBlock = this.checkBlock(pos)
  if (!newBlock) return
  var chunk = this.voxels.chunks[newBlock.chunkIndex]
  chunk.voxels[this.voxels.voxelIndex(newBlock.voxelVector)] = val
  this.showChunk(chunk)
  return true
}

Game.prototype.detachChunk = function (chunk) {
  return this.detached.create(chunk)
}

Game.prototype.setBlock = function(pos, val) {
  var hitVoxel = this.voxels.voxelAtPosition(pos, val)
  var c = this.voxels.chunkAtPosition(pos)
  this.showChunk(this.voxels.chunks[c.join('|')])
}

Game.prototype.getBlock = function(pos) {
  return this.voxels.voxelAtPosition(pos)
}

Game.prototype.showChunk = function(chunk) {
  var chunkIndex = chunk.position.join('|')
  var bounds = this.voxels.getBounds.apply(this.voxels, chunk.position)
  var cubeSize = this.cubeSize
  var scale = new THREE.Vector3(cubeSize, cubeSize, cubeSize)
  var mesh = voxelMesh(chunk, voxel.meshers.greedy, scale)
  this.voxels.chunks[chunkIndex] = chunk
  if (this.voxels.meshes[chunkIndex]) this.scene.remove(this.voxels.meshes[chunkIndex][this.meshType])
  this.voxels.meshes[chunkIndex] = mesh
  if (this.meshType === 'wireMesh') mesh.createWireMesh()
  else mesh.createSurfaceMesh(this.material)
  mesh.setPosition(bounds[0][0] * cubeSize, bounds[0][1] * cubeSize, bounds[0][2] * cubeSize)
  mesh.addToScene(this.scene)
  this._materialEngine.applyTextures(mesh.geometry)
  this.items.forEach(function (item) { item.resting = false })
  return mesh
}

Game.prototype.calculateFreedom = function(cs, pos) {
  var freedom = {
    'x+': true, 'y+': true, 'z+': true,
    'x-': true, 'y-': true, 'z-': true
  }

  freedom['y+'] = cs.top.length === 0
  freedom['y-'] = cs.bottom.length === 0

  if (cs.left.length) freedom['x+'] = false
  if (cs.right.length) freedom['x-'] = false
  if (cs.up.length) freedom['y+'] = false
  if (cs.down.length) freedom['y-'] = false
  if (cs.forward.length) freedom['z-'] = false
  if (cs.back.length) freedom['z+'] = false

  return freedom
}

Game.prototype.updatePlayerPhysics = function(controls) {
  var self = this

  var pos = controls.yawObject.position.clone()
  pos.y -= this.cubeSize

  var cs = this.getCollisions(pos, {
    width: this.cubeSize / 2,
    depth: this.cubeSize / 2,
    height: this.cubeSize * 1.5
  }, false, controls)
  var freedom = this.calculateFreedom(cs, pos)

  var degrees = 0
  Object.keys(freedom).forEach(function (key) { degrees += freedom[key] })
  controls.freedom = degrees === 0 ? controls.freedom : freedom

  var ry = this.controls.yawObject.rotation.y
  var v = controls.velocity
  var mag = 1

  if (cs.left.length && !cs.right.length) {
    controls.yawObject.position.x += mag * Math.cos(ry - Math.PI / 2)
  }
  if (cs.right.length && !cs.left.length) {
    controls.yawObject.position.x += mag * Math.cos(ry + Math.PI / 2)
  }

  if (cs.forward.length && !cs.back.length) {
    controls.yawObject.position.z += mag * Math.sin(ry)
  }
  if (cs.back.length && !cs.forward.length) {
    controls.yawObject.position.z += mag * Math.sin(ry - Math.PI)
  }
}

Game.prototype.bindWASD = function (controls) {
  var self = this
  var onKeyDown = function ( event ) {
    switch ( event.keyCode ) {
      case 38: // up
      case 87: // w
        controls.emit('command', 'moveForward', true)
        break

      case 37: // left
      case 65: // a
        controls.emit('command', 'moveLeft', true)
        break

      case 40: // down
      case 83: // s
        controls.emit('command', 'moveBackward', true)
        break

      case 39: // right
      case 68: // d
        controls.emit('command', 'moveRight', true)
        break

      case 32: // space
        controls.emit('command', 'jump')
        break;
    }
  }

  var onKeyUp = function ( event ) {
    switch( event.keyCode ) {
      case 38: // up
      case 87: // w
        controls.emit('command', 'moveForward', false)
        break

      case 37: // left
      case 65: // a
        controls.emit('command', 'moveLeft', false)
        break

      case 40: // down
      case 83: // a
        controls.emit('command', 'moveBackward', false)
        break

      case 39: // right
      case 68: // d
        controls.emit('command', 'moveRight', false)
        break
    }
  };

  document.addEventListener( 'keydown', onKeyDown, false )
  document.addEventListener( 'keyup', onKeyUp, false )
}

Game.prototype.tick = function(delta) {
  this.controls.tick(delta, this.updatePlayerPhysics.bind(this))
  this.items.forEach(function (item) { item.tick(delta) })
  this.emit('tick', delta)
  this.renderer.render(this.scene, this.camera)
  stats.update()
}

function distance (a, b) {
  var x = a.x - b.x
  var y = a.y - b.y
  var z = a.z - b.z
  return Math.sqrt(x*x + y*y + z*z)
}
