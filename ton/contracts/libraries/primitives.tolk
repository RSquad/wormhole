tolk 1.1

// See the details in https://docs.ton.org/v3/documentation/tvm/instructions
@pure
fun ecrecover(hash: uint256, v: uint8, r: uint256, s: uint256): (uint8, uint256, uint256, bool) 
asm "ECRECOVER NULLSWAPIFNOT2 NULLSWAPIFNOT";

// Calculates and returns hash of the concatenation of slices (or builders) from tuple
@pure
fun keccak256_tuple(t: tuple): uint256 
asm "DUP TLEN EXPLODEVAR HASHEXT_KECCAK256";

// Calculates hash from the builder or slice data
@pure
fun keccak256(b: builder): uint256 asm "1 PUSHINT HASHEXT_KECCAK256";