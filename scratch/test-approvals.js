async function testApprovalsApi() {
  try {
    console.log("Testing GET /api/approvals on port 3001...");
    const res = await fetch("http://localhost:3001/api/approvals?status=PENDING");
    console.log("GET /api/approvals status:", res.status);
    if (res.ok) {
      const data = await res.json();
      console.log("✓ Success! Pending approvals count:", data.length);
      if (data.length > 0) {
        console.log("Sample pending approval request:");
        console.dir(data[0], { depth: 3 });
      }
    } else {
      console.log("GET Approvals error:", await res.text());
    }
  } catch (err) {
    console.error("Test Approvals Error:", err.message);
  }
}

testApprovalsApi();
