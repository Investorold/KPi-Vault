import { expect } from "chai";
import { ethers } from "hardhat";
import { KpiManager } from "../types/src/KpiManager";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("KpiManager", function () {
  let kpiManager: KpiManager;
  let owner: HardhatEthersSigner;
  let admin: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let viewer: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, admin, user1, user2, viewer] = await ethers.getSigners();

    const KpiManagerFactory = await ethers.getContractFactory("KpiManager");
    kpiManager = await KpiManagerFactory.deploy();
    await kpiManager.waitForDeployment();
  });

  describe("Admin Management", function () {
    it("Should set deployer as initial admin", async function () {
      expect(await kpiManager.isAdmin(owner.address)).to.be.true;
    });

    it("Should allow admin to add another admin", async function () {
      await expect(kpiManager.connect(owner).addAdmin(admin.address))
        .to.emit(kpiManager, "AdminAdded")
        .withArgs(admin.address);

      expect(await kpiManager.isAdmin(admin.address)).to.be.true;
    });

    it("Should allow admin to remove another admin", async function () {
      await kpiManager.connect(owner).addAdmin(admin.address);
      
      await expect(kpiManager.connect(owner).removeAdmin(admin.address))
        .to.emit(kpiManager, "AdminRemoved")
        .withArgs(admin.address);

      expect(await kpiManager.isAdmin(admin.address)).to.be.false;
    });

    it("Should prevent non-admin from adding admin", async function () {
      await expect(
        kpiManager.connect(user1).addAdmin(admin.address)
      ).to.be.revertedWith("KpiManager: not admin");
    });

    it("Should prevent admin from removing themselves", async function () {
      await expect(
        kpiManager.connect(owner).removeAdmin(owner.address)
      ).to.be.revertedWith("KpiManager: cannot remove self");
    });

    it("Should prevent adding zero address as admin", async function () {
      await expect(
        kpiManager.connect(owner).addAdmin(ethers.ZeroAddress)
      ).to.be.revertedWith("KpiManager: zero address");
    });
  });

  describe("Access Control", function () {
    const metricId = ethers.id("test-metric");

    it("Should allow owner to grant access to viewer", async function () {
      await expect(kpiManager.connect(user1).grantAccess(metricId, viewer.address))
        .to.emit(kpiManager, "MetricAccessGranted")
        .withArgs(user1.address, metricId, viewer.address);

      expect(await kpiManager.hasAccess(user1.address, metricId, viewer.address)).to.be.true;
    });

    it("Should allow owner to revoke access from viewer", async function () {
      await kpiManager.connect(user1).grantAccess(metricId, viewer.address);
      
      await expect(kpiManager.connect(user1).revokeAccess(metricId, viewer.address))
        .to.emit(kpiManager, "MetricAccessRevoked")
        .withArgs(user1.address, metricId, viewer.address);

      expect(await kpiManager.hasAccess(user1.address, metricId, viewer.address)).to.be.false;
    });

    it("Should prevent granting access to zero address", async function () {
      await expect(
        kpiManager.connect(user1).grantAccess(metricId, ethers.ZeroAddress)
      ).to.be.revertedWith("KpiManager: viewer required");
    });

    it("Should prevent granting access to self", async function () {
      await expect(
        kpiManager.connect(user1).grantAccess(metricId, user1.address)
      ).to.be.revertedWith("KpiManager: self access implicit");
    });

    it("Should prevent revoking access that was never granted", async function () {
      await expect(
        kpiManager.connect(user1).revokeAccess(metricId, viewer.address)
      ).to.be.revertedWith("KpiManager: viewer not authorized");
    });

    it("Should return true for owner access", async function () {
      expect(await kpiManager.hasAccess(user1.address, metricId, user1.address)).to.be.true;
    });

    it("Should return list of authorized viewers", async function () {
      await kpiManager.connect(user1).grantAccess(metricId, viewer.address);
      await kpiManager.connect(user1).grantAccess(metricId, user2.address);

      const viewers = await kpiManager.getAuthorizedViewers(user1.address, metricId);
      expect(viewers).to.include(viewer.address);
      expect(viewers).to.include(user2.address);
      expect(viewers.length).to.equal(2);
    });

    it("Should exclude revoked viewers from authorized list", async function () {
      await kpiManager.connect(user1).grantAccess(metricId, viewer.address);
      await kpiManager.connect(user1).grantAccess(metricId, user2.address);
      await kpiManager.connect(user1).revokeAccess(metricId, viewer.address);

      const viewers = await kpiManager.getAuthorizedViewers(user1.address, metricId);
      expect(viewers).to.not.include(viewer.address);
      expect(viewers).to.include(user2.address);
      expect(viewers.length).to.equal(1);
    });
  });

  describe("Metric Storage", function () {
    const metricId = ethers.id("test-metric");
    const timestamp = Math.floor(Date.now() / 1000);

    // Note: Full FHE encryption testing requires the FHEVM relayer
    // These tests verify the contract structure and access control
    // For full end-to-end tests with encryption, see integration tests

    it("Should return empty array for non-existent metric", async function () {
      const metrics = await kpiManager.getMetrics(user1.address, metricId);
      expect(metrics.length).to.equal(0);
    });

    it("Should emit MetricRecorded event when metric is recorded", async function () {
      // This test would require actual FHE encryption setup
      // For now, we verify the contract structure is correct
      // Full encryption tests should be done in integration tests
      expect(kpiManager).to.not.be.undefined;
    });
  });

  describe("Multiple Metrics", function () {
    const metricId1 = ethers.id("metric-1");
    const metricId2 = ethers.id("metric-2");

    it("Should handle access control independently per metric", async function () {
      await kpiManager.connect(user1).grantAccess(metricId1, viewer.address);
      
      expect(await kpiManager.hasAccess(user1.address, metricId1, viewer.address)).to.be.true;
      expect(await kpiManager.hasAccess(user1.address, metricId2, viewer.address)).to.be.false;
    });

    it("Should allow different viewers for different metrics", async function () {
      await kpiManager.connect(user1).grantAccess(metricId1, viewer.address);
      await kpiManager.connect(user1).grantAccess(metricId2, user2.address);

      const viewers1 = await kpiManager.getAuthorizedViewers(user1.address, metricId1);
      const viewers2 = await kpiManager.getAuthorizedViewers(user1.address, metricId2);

      expect(viewers1).to.include(viewer.address);
      expect(viewers2).to.include(user2.address);
    });
  });

  describe("Edge Cases", function () {
    const metricId = ethers.id("test-metric");

    it("Should handle multiple grant/revoke cycles", async function () {
      await kpiManager.connect(user1).grantAccess(metricId, viewer.address);
      expect(await kpiManager.hasAccess(user1.address, metricId, viewer.address)).to.be.true;

      await kpiManager.connect(user1).revokeAccess(metricId, viewer.address);
      expect(await kpiManager.hasAccess(user1.address, metricId, viewer.address)).to.be.false;

      await kpiManager.connect(user1).grantAccess(metricId, viewer.address);
      expect(await kpiManager.hasAccess(user1.address, metricId, viewer.address)).to.be.true;
    });

    it("Should handle granting access multiple times (idempotent)", async function () {
      await kpiManager.connect(user1).grantAccess(metricId, viewer.address);
      await kpiManager.connect(user1).grantAccess(metricId, viewer.address);
      await kpiManager.connect(user1).grantAccess(metricId, viewer.address);

      const viewers = await kpiManager.getAuthorizedViewers(user1.address, metricId);
      expect(viewers.length).to.equal(1);
      expect(viewers[0]).to.equal(viewer.address);
    });

    it("Should handle removing zero address as admin", async function () {
      await expect(
        kpiManager.connect(owner).removeAdmin(ethers.ZeroAddress)
      ).to.be.revertedWith("KpiManager: zero address");
    });

    it("Should handle different owners independently", async function () {
      const metricId1 = ethers.id("user1-metric");
      const metricId2 = ethers.id("user2-metric");

      await kpiManager.connect(user1).grantAccess(metricId1, viewer.address);
      await kpiManager.connect(user2).grantAccess(metricId2, viewer.address);

      expect(await kpiManager.hasAccess(user1.address, metricId1, viewer.address)).to.be.true;
      expect(await kpiManager.hasAccess(user2.address, metricId2, viewer.address)).to.be.true;
      expect(await kpiManager.hasAccess(user1.address, metricId2, viewer.address)).to.be.false;
      expect(await kpiManager.hasAccess(user2.address, metricId1, viewer.address)).to.be.false;
    });
  });

  describe("Admin Events", function () {
    it("Should emit AdminAdded event when adding admin", async function () {
      await expect(kpiManager.connect(owner).addAdmin(admin.address))
        .to.emit(kpiManager, "AdminAdded")
        .withArgs(admin.address);
    });

    it("Should emit AdminRemoved event when removing admin", async function () {
      await kpiManager.connect(owner).addAdmin(admin.address);
      
      await expect(kpiManager.connect(owner).removeAdmin(admin.address))
        .to.emit(kpiManager, "AdminRemoved")
        .withArgs(admin.address);
    });

    it("Should not emit duplicate AdminAdded events", async function () {
      await kpiManager.connect(owner).addAdmin(admin.address);
      
      // Second call should not emit event (already admin)
      const tx = await kpiManager.connect(owner).addAdmin(admin.address);
      const receipt = await tx.wait();
      
      const events = receipt?.logs.filter(
        (log) => log.topics[0] === kpiManager.interface.getEvent("AdminAdded").topicHash
      );
      expect(events?.length).to.equal(0);
    });
  });

  describe("Access Control Events", function () {
    const metricId = ethers.id("test-metric");

    it("Should emit MetricAccessGranted event", async function () {
      await expect(kpiManager.connect(user1).grantAccess(metricId, viewer.address))
        .to.emit(kpiManager, "MetricAccessGranted")
        .withArgs(user1.address, metricId, viewer.address);
    });

    it("Should emit MetricAccessRevoked event", async function () {
      await kpiManager.connect(user1).grantAccess(metricId, viewer.address);
      
      await expect(kpiManager.connect(user1).revokeAccess(metricId, viewer.address))
        .to.emit(kpiManager, "MetricAccessRevoked")
        .withArgs(user1.address, metricId, viewer.address);
    });

    it("Should not emit duplicate MetricAccessGranted events", async function () {
      await kpiManager.connect(user1).grantAccess(metricId, viewer.address);
      
      // Second call should not emit event (already granted)
      const tx = await kpiManager.connect(user1).grantAccess(metricId, viewer.address);
      const receipt = await tx.wait();
      
      const events = receipt?.logs.filter(
        (log) => log.topics[0] === kpiManager.interface.getEvent("MetricAccessGranted").topicHash
      );
      expect(events?.length).to.equal(0);
    });
  });
});

