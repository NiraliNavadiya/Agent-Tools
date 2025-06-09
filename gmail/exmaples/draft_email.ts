// Example 1

const input = "Create a draft email to john@gmail.com about Keyflow's new feature with subject 'New Feature Alert' ",


// Break doen Query
const queries = {
    "queries": [
        {
            "to": "sam@gmail.com",
            "cc": null,
            "bcc": null,
            "subject": "New Feature Alert",
            "body": "Hi Sam,\n\nI wanted to share some exciting news about Keyflow's new feature. Let me know if you'd like more details.\n\nBest regards,",
            "labels": null,
            "sendAsHtml": false,
            "threadId": "",
            "attachments": null
        },
        {
            "to": "marketing@company.com",
            "cc": [
                "sales@company.com"
            ],
            "bcc": null,
            "subject": "Product Launch Update",
            "body": "Hello Team,\n\nThis is an update regarding the upcoming product launch. Please review the details and prepare accordingly.\n\nThank you.",
            "labels": null,
            "sendAsHtml": false,
            "threadId": "",
            "attachments": null
        }
    ],
    "reasoning": "The original query requested two draft emails. The first is to sam@gmail.com about Keyflow's new feature with the subject 'New Feature Alert'. The second is to marketing@company.com with sales@company.com CC'd about the upcoming product launch with the subject 'Product Launch Update'. Each simplified query corresponds to one email and includes the relevant recipients, subject, and a generic body to match the topics mentioned."
}


// Example 2

const query = "Create a draft email to niralinavadiya19@gmail.com about Keyflow's new feature with subject 'New Feature Alert' "
const breakdownQuery = {
    "queries": [
        {
            "to": "niralinavadiya19@gmail.com",
            "cc": null,
            "bcc": null,
            "subject": "New Feature Alert",
            "body": "Hi Nirali,\n\nI wanted to inform you about Keyflow's new feature. Let me know if you have any questions or need more details.\n\nBest regards,\n[Your Name]",
            "labels": null,
            "sendAsHtml": false,
            "threadId": "",
            "attachments": null
        }
    ]
}
const results = [
    {
        id: 'r-4106249311171958804',
        messageId: '1974ede80f7f2444',
        threadId: '1974ede80f7f2444'
    }
]


// Example 3
const query_3 = 'Create a draft to 190420107535.co19s2 @scet.ac.in and niralinavadiya19 @gmail.com stating that Keyflow has a new feature update.Include the changelog URL: https://www.keyflow.space/changelog.'
const breakdown_query_query_3 = { "queries": [{ "to": ["190420107535.co19s2@scet.ac.in", "niralinavadiya19@gmail.com"], "cc": null, "bcc": null, "subject": "Keyflow New Feature Update", "body": "Hello,\n\nWe are excited to announce that Keyflow has a new feature update. You can check out all the details and the changelog here: https://www.keyflow.space/changelog.\n\nBest regards,\nKeyflow Team", "labels": null, "sendAsHtml": false, "threadId": "", "messageId": "", "attachments": null }] }
const resutt_3 = [
    {
        id: 'r-1255419344428051559',
        messageId: '1974f301a8a83dc2',
        threadId: '1974f301a8a83dc2'
    }
]

// // Example 4
// const query_
// const breakdown_query_query_
// const resutt_