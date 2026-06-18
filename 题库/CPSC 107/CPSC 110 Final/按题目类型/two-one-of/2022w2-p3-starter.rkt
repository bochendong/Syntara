;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)

(@assignment exams/2022w2-f/f-p3)

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line

;;
;; Consider the following data definition.  Note that this is just a binary
;; tree, it is not a binary search tree.  Each node has a key, value, left
;; child, and right child - like a binary search tree. But, there are no
;; constraints on the arrangements of the nodes keys - unlike a binary search
;; tree.
;;


(@htdd BinTree)
(define-struct node (key val lef rig))
;; BinTree is one of:
;; - false
;; - (make-node Integer String BinTree BinTree)
;; interp. a binary tree

(define BT0 false)
(define BT10 (make-node 10 "10" false false))
(define BT30 (make-node 30 "30" BT10 (make-node 40 "40" false false)))


#|

[20 points]

Design the function below.

The function consumes two binary trees and produces true if they are equal.
Note that this problem will not be hand-graded, but you should treat it as a
two-one-of problem and sketch out a cross-product of type comments table
anyways.

Your answer must include @signature, purpose, appropriate check-expects,
@template-origin and a correct function definition.

After you finish the rest of the exam, if you have time, come back and think 
very carefully about test argument thoroughness.  There are a surprising
number of cases.

NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
      IN YOUR SOLUTION.  Failure to follow these requirements may result in
      receiving zero marks for this problem.

 - The function you design MUST BE CALLED btree-equal?
 - You MUST NOT EDIT the provided @htdf tag.
 - You MUST NOT COMMENT out any @ metadata tags.
 - You must follow all applicable design rules.
 - The file MUST NOT have any errors when the Check Syntax button is pressed.

|#

(@htdf btree-equal?)

(define (btree-equal? t1 t2) false)
