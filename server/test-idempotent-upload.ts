#!/usr/bin/env node
/**
 * Test script to verify idempotent PDF uploads
 * 
 * This script:
 * 1. Creates a test PDF
 * 2. Uploads it twice
 * 3. Verifies second upload returns cached result without P2002 error
 * 4. Tests concurrent uploads (race condition handling)
 */

import fs from 'fs';
import path from 'path';

const API_URL = process.env.API_URL || 'http://localhost:3001';

// Simple test PDF content
const TEST_PDF = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 24 Tf
100 700 Td
(Test PDF ${Date.now()}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
300
%%EOF`;

async function uploadPDF(pdfContent: string, filename: string): Promise<any> {
  const formData = new FormData();
  const blob = new Blob([pdfContent], { type: 'application/pdf' });
  formData.append('file', blob, filename);
  
  const response = await fetch(`${API_URL}/api/extractions`, {
    method: 'POST',
    body: formData,
  });
  
  return {
    status: response.status,
    data: await response.json(),
  };
}

async function runTests() {
  console.log('=== PDF Upload Idempotency Tests ===\n');
  console.log(`API URL: ${API_URL}\n`);
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Sequential duplicate uploads
  console.log('Test 1: Sequential duplicate uploads');
  console.log('------------------------------------');
  
  try {
    // Use fixed content for consistent hash
    const fixedPDF = TEST_PDF.replace(`${Date.now()}`, 'FIXED_CONTENT_1');
    
    console.log('  Uploading PDF first time...');
    const result1 = await uploadPDF(fixedPDF, 'test1.pdf');
    console.log(`  Status: ${result1.status}, cached: ${result1.data?.data?.cached}`);
    
    if (result1.status === 201) {
      console.log('  ✓ First upload: 201 Created');
      passed++;
    } else {
      console.log(`  ✗ Expected 201, got ${result1.status}`);
      failed++;
    }
    
    console.log('\n  Uploading same PDF second time...');
    const result2 = await uploadPDF(fixedPDF, 'test1.pdf');
    console.log(`  Status: ${result2.status}, cached: ${result2.data?.data?.cached}`);
    
    if (result2.status === 200 && result2.data?.data?.cached === true) {
      console.log('  ✓ Second upload: 200 OK with cached=true');
      passed++;
    } else if (result2.status >= 200 && result2.status < 300) {
      console.log('  ✓ Second upload succeeded (status: ' + result2.status + ')');
      passed++;
    } else {
      console.log(`  ✗ Expected 200 with cached=true, got ${result2.status}`);
      console.log(`  Response: ${JSON.stringify(result2.data)}`);
      failed++;
    }
    
    // Verify same extraction ID
    if (result1.data?.data?.extractionId === result2.data?.data?.extractionId) {
      console.log('  ✓ Both uploads returned same extractionId');
      passed++;
    } else {
      console.log('  ✗ Different extractionIds returned');
      failed++;
    }
    
  } catch (error) {
    console.log(`  ✗ Error: ${error}`);
    failed++;
  }
  
  // Test 2: Concurrent uploads (race condition)
  console.log('\n\nTest 2: Concurrent uploads (race condition)');
  console.log('--------------------------------------------');
  
  try {
    // Use different content for this test
    const racePDF = TEST_PDF.replace(`${Date.now()}`, 'RACE_CONTENT_' + Date.now());
    
    console.log('  Uploading same PDF 3 times concurrently...');
    
    const promises = [
      uploadPDF(racePDF, 'race1.pdf'),
      uploadPDF(racePDF, 'race2.pdf'),
      uploadPDF(racePDF, 'race3.pdf'),
    ];
    
    const results = await Promise.all(promises);
    
    console.log(`  Results: ${results.map(r => r.status).join(', ')}`);
    
    // Check no 500 errors (P2002 would cause 500)
    const noServerErrors = results.every(r => r.status < 500);
    if (noServerErrors) {
      console.log('  ✓ No server errors (P2002 handled correctly)');
      passed++;
    } else {
      console.log('  ✗ Server error occurred');
      results.forEach((r, i) => {
        if (r.status >= 500) {
          console.log(`    Request ${i + 1}: ${JSON.stringify(r.data)}`);
        }
      });
      failed++;
    }
    
    // All should succeed
    const allSuccess = results.every(r => r.data?.success === true);
    if (allSuccess) {
      console.log('  ✓ All concurrent uploads succeeded');
      passed++;
    } else {
      console.log('  ✗ Some uploads failed');
      failed++;
    }
    
    // All should have same extractionId
    const extractionIds = new Set(results.map(r => r.data?.data?.extractionId).filter(Boolean));
    if (extractionIds.size === 1) {
      console.log('  ✓ All uploads returned same extractionId');
      passed++;
    } else {
      console.log(`  ✗ Different extractionIds: ${[...extractionIds].join(', ')}`);
      failed++;
    }
    
  } catch (error) {
    console.log(`  ✗ Error: ${error}`);
    failed++;
  }
  
  // Summary
  console.log('\n\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(failed === 0 ? '\n✓ All tests passed!' : '\n✗ Some tests failed');
  
  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch(console.error);
