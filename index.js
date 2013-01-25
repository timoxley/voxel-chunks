var voxel = require('voxel');
var ChunkMatrix = require('./lib/chunk_matrix');

module.exports = Group;

function Group (game) {
    if (!(this instanceof Group)) return new Group(game);
    this.meshes = [];
    this.chunkMatricies = [];
    this.game = game;
}

Group.prototype.create = function (generate) {
    var self = this;
    var cm = new ChunkMatrix(self.game, generate);
    cm.on('add', function (id) {
        self.chunkMatricies[id] = cm;
    });
    cm.on('remove', function (id) {
        delete self.chunkMatricies[id];
    });
    self.chunkMatricies.push(cm);
    return cm;
};
    
Group.prototype.createBlock = function (start, d, pos, val) {
    var self = this
    var T = self.game.THREE
    var size = self.cubeSize
    
    var ray = new T.Raycaster(start, d)
    var intersections = ray.intersectObjects(self.detached.meshes)
    
    if (intersections.length === 0) return false;
    
    var dists = intersections.map(function (i) { return i.distance })
    var inter = intersections[dists.indexOf(Math.min.apply(null, dists))]
    var cm = self.chunkMatricies[inter.object.id]
    
    var mr = new T.Matrix4().getInverse(cm.rotationObject.matrix)
    var mt = new T.Matrix4().getInverse(cm.translationObject.matrix)
    var m = new T.Matrix4().multiply(mt, mr)
    
    return (function draw (offset) {
        var pt = new T.Vector3()
        pt.copy(inter.point)
        
        pt.x -= d.x * offset
        pt.y -= d.y * offset
        pt.z -= d.z * offset
        offset += size / 8
        
        var tr = m.multiplyVector3(pt)
        
        var ci = self._chunkIndex(tr);
        var vi = self._voxelIndex(tr);
        
        var value = cm.getByIndex(ci, vi)
        
        if (!value) {
            console.log('offset=' + offset)
            cm.setByIndex(ci, vi, 3)
            return true;
        }
        else draw(offset + 0.1)
    })(0)
};

Group.prototype.setBlock = function (pos, val) {
    var ix = this.getIndex(pos);
    var vm = this.chunkMatricies[ix.matrix];
    return cm.setByIndex(ix.chunk, ix.voxel, val);
};

Group.prototype.getBlock = function (pos) {
    var ix = this.getIndex(pos);
    var vm = this.chunkMatricies[ix.matrix];
    return cm.getByIndex(ix.chunk, ix.voxel);
};

Group.prototype.getIndex = function (pos) {
    var T = this.game.THREE;
    var mi = this._matrixIndex(pos);
    if (mi < 0) return undefined;
    
    var cm = this.chunkMatricies[mi];
    
    var mr = new T.Matrix4().getInverse(cm.rotationObject.matrix);
    var mt = new T.Matrix4().getInverse(cm.translationObject.matrix);
    var m = new T.Matrix4().multiply(mt, mr);
    
    var tr = m.multiplyVector3(pos);
    
    var ci = this._chunkIndex(tr);
    var vi = this._voxelIndex(tr);
    
    return { matrix: mi, chunk: ci, voxel: vi };
};

Group.prototype._chunkIndex = function (pos) {
    var chunkSize = this.game.chunkSize;
    var cubeSize = this.game.cubeSize;
    var cx = position.x / cubeSize / chunkSize;
    var cy = position.y / cubeSize / chunkSize;
    var cz = position.z / cubeSize / chunkSize;
    var ckey = [ Math.floor(cx), Math.floor(cy), Math.floor(cz) ];
    return ckey.join('|');
};

Group.prototype._voxelIndex = function (pos) {
    var size = this.game.chunkSize;
    var cubeSize = this.game.cubeSize;
    var vx = (size + Math.floor(pos.x / cubeSize) % size) % size;
    var vy = (size + Math.floor(pos.y / cubeSize) % size) % size;
    var vz = (size + Math.floor(pos.z / cubeSize) % size) % size;
    var x = Math.abs(vx);
    var y = Math.abs(vy);
    var z = Math.abs(vz);
    return x + y*size + z*size*size;
};

Group.prototype._matrixIndex = function (pos) {
    for (var i = 0; i < this.chunkMatricies.length; i++) {
        var cm = this.chunkMatricies[i];
        var mr = new T.Matrix4().getInverse(cm.rotationObject.matrix);
        var mt = new T.Matrix4().getInverse(cm.translationObject.matrix);
        var m = new T.Matrix4().multiply(mt, mr);
        var tr = m.multiplyVector3(pos);
        var ci = this._chunkIndex(tr);
        var vi = this._voxelIndex(tr);
        if (cm.chunks[ci].voxels[vi] !== 0) return i;
    }
    return -1;
};
