// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

contract RedPacket {
    address payable public yideng;
    uint256 public totalAmount;
    bool public isEqual;
    uint256 public count;
    uint256 public roundId;
    mapping(address => uint256) public grabbedRound;

    event PacketCreated(address indexed sender, uint256 amount, uint256 count, bool isEqual, uint256 roundId);
    event PacketGrabbed(address indexed sender, uint256 amount, uint256 roundId);

    constructor() {
        yideng = payable(msg.sender);
    }

    modifier onlyWhenActive() {
        require(count > 0, "count must > 0");
        _;
    }

    // 合约本身自带余额
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    // 创建新的红包轮次，需要带上资金
    function createRedPacket(uint256 c, bool _isEqual) external payable {
        require(msg.value > 0, "amount must > 0");
        require(c > 0, "count must > 0");
        require(count == 0, "previous packet still active");
        require(msg.value >= c, "amount must >= count");

        yideng = payable(msg.sender);
        isEqual = _isEqual;
        totalAmount = msg.value;
        count = c;
        roundId++;

        emit PacketCreated(msg.sender, msg.value, c, _isEqual, roundId);
    }

    // 领取红包
    function grabRedPacket() public onlyWhenActive {
        require(grabbedRound[msg.sender] != roundId, "you have grabbed");
        require(totalAmount > 0, "totalAmount must > 0");

        grabbedRound[msg.sender] = roundId;
        uint256 amount;

        if (count == 1) {
            amount = totalAmount;
        } else if (isEqual) {
            amount = totalAmount / count;
            require(amount > 0, "per-share amount is zero");
        } else {
            uint256 random = (uint256(
                keccak256(
                    abi.encodePacked(
                        msg.sender,
                        yideng,
                        count,
                        totalAmount,
                        block.timestamp
                    )
                )
            ) % 8) + 1;
            amount = (totalAmount * random) / 10;
            if (amount == 0) {
                amount = 1;
            }
        }

        payable(msg.sender).transfer(amount);
        totalAmount -= amount;
        count--;

        emit PacketGrabbed(msg.sender, amount, roundId);
    }
}
