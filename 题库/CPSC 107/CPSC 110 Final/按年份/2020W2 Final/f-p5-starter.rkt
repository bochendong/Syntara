;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment f-p5)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)

(@problem 1) ;This is actually problem 5, DO NOT EDIT OR DELETE THIS LINE!

;; PROBLEM
;;
;; Consider the following data definition.

(@htdd Node)
(define-struct node (name num nexts))
;; Node is (make-node String Natural (listof String))
;; A node in a graph that has:
;;  - the name of the node (these are unique in any given graph)
;;  - a number for the node (these may be duplicated in a given graph)
;;  - a list of the names of the node this node has an arrow pointing TO
;; CONSTRAINT: No node in any graph will have a number less than 1. In
;;             other words, no node will have number 0.
;;
;; The graph you will be working with in this problem is shown in the
;; f-p5.pdf download file.  In that graph the node A would be represented
;; as (make-node "A" 1 (list "D" "H" "B")). (We are ordering the list of
;; next node names in left to right order of the arrow origins (the NOT
;; pointy-end of the arrow.)
;;
;; We are also providing you with the following template for operating
;; on a graph.  Note that this template calls the lookup-node function
;; to find the node with a given name.  The definition of lookup-node is
;; at the end of the starter file.  Given the picture in the pdf file
;; you do not need to look at that function definition. But if you do 
;; look at that function definition you must not under any circumstance
;; edit it. If you edit the definition of lookup node in any way at all
;; you will receive 0 marks for this entire problem.
;;
(define (fn-for-graph start-node-name)
  ;; Termination argument:
  ;;
  (local [(define (fn-for-node n)
            (... (node-name n)
                 (node-num n)
                 (fn-for-los (node-nexts n))))
          
          (define (fn-for-los los)
            (cond [(empty? los) (...)]
                  [else
                   (... (fn-for-string (first los))
                        (fn-for-los (rest los)))]))

          (define (fn-for-string s)
            (... (fn-for-node (lookup-node s))))]
    
    (fn-for-string start-node-name)))



;;
;; PROBLEM
;;
;; Design a function that:
;;   - is called find-increasing-path
;;   - consumes the names of start and destination nodes
;;   - tries to find a path from start to destination
;;   - without passing through any node more than once
;;   - and such that each node on the path has a number > than the prior
;;     node
;;   - if found it should produce a list of the names of the nodes in
;;     order from start to destination for first path found
;;   - otherwise it should fail
;;
;; For example  (find-increasing-path "A" "C") --> (list "A" "B" "C")
;;
;; But          (find-increasing-path "D" "I") --> false
;; because you cannot go from D to H - D has number 3 and H has number 2
;;
;; This is a graph problem, so you must include a termination argument.
;;
;; Be sure to follow every step of the design recipe.  It will help us award
;; you partial credit and it will help you get to the solution.
;;
;; NOTE:
;;
;;  There is NO REASON FOR THIS TO BE TAIL RECURSIVE.  The tail recursive
;;  solution is challenging.  We strongly encourage you NOT TO DO A TAIL
;;  recursive version.
;;
;; BUT: If you hand in a CORRECT tail recursive version we will award 
;;      bonus marks to your final exam score worth 15% of the weight of
;;      this question .  On the other hand, an incorrect tail recursive
;;      version will not earn any extra marks or special consideration
;;      because you tried the more difficult thing.
;;
;; We recommend that you start by making a correct non-tail recursive version.
;; Once you get that right, you can try to convert it to tail recursion if you
;; have time, if you fail to convert it you will still have the non-tail
;; recursive version.  But note that you MUST HAND IN ONLY **ONE** VERSION.
;; What this means is that you must DELETE ONE VERSION FROM YOUR FILE BEFORE
;; YOU SUBMIT. If you hand in more than one version you will get 0 marks for
;; this problem.

;(@htdf find-increasing-path) ;uncomment this line when you start














;; YOU DO NOT NEED TO READ PAST HERE, AND YOU MUST NOT MAKE ANY EDITS PAST HERE.
              
(define (lookup-node name)
  (local [(define (scan lst)
            (cond [(empty? lst) (error "Unknown node name " name)]
                  [else
                   (if (string=? (node-name (first lst)) name)
                       (first lst)
                       (scan (rest lst)))]))]
    (scan (list (make-node "A" 1 (list "D" "H" "B"))
                (make-node "B" 2 (list "A" "C"))
                (make-node "C" 3 (list "H"))
                (make-node "D" 3 (list "E" "H"))
                (make-node "E" 4 (list "F"))
                (make-node "F" 5 (list "D" "G"))
                (make-node "G" 6 (list ))
                (make-node "H" 2 (list "F" "I"))
                (make-node "I" 5 (list ))))))
