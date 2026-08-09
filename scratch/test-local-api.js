async function testPort3001() {
  try {
    console.log("Testing fetch http://localhost:3001/api/receipts ...");
    const res = await fetch("http://localhost:3001/api/receipts");
    console.log("Port 3001 status:", res.status);
    if (res.ok) {
      const data = await res.json();
      console.log("✓ Success! Port 3001 data length:", data.length);
      if (data.length > 0) {
        console.log("Sample receipt from port 3001:", data[0].merchantName, "Rp", data[0].totalAmount);
      }
    } else {
      console.log("Port 3001 error response:", await res.text());
    }
  } catch (err) {
    console.error("Port 3001 fetch error (Is server on 3001 running?):", err.message);
  }
}

testPort3001();
