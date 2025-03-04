import {
  ECR20,
  Approval,
} from "generated";

ECR20.Approval.handler(async ({ event, context }) => {

  const { owner, spender, value } = event.params;
  const token = event.srcAddress;
  const hash = event.transaction.hash;

  const entity: Approval = {
    id: `${owner}-${token}-${spender}`,
    owner: owner,
    token: token,    
    spender: spender,
    value: value,
    hash: hash,
  };  

  context.Approval.set(entity);

}, {wildcard: true});

ECR20.Transfer.handler(async ({ event, context }) => {
  const { from, value } = event.params;
  const token = event.srcAddress;
  
  const approvalId = `${from}-${token}-${event.transaction.from}`; // spender is `event.transaction.from`
  const existingApproval = await context.Approval.get(approvalId);

  if (existingApproval) {    
    const updatedApproval: Approval = {
      ...existingApproval,
      value: existingApproval.value - value,
    };

    context.Approval.set(updatedApproval);
  }
  
}, { wildcard: true });